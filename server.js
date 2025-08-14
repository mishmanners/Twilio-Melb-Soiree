
require('dotenv').config();

// TODO: criar pasta output

const express = require('express');
const app = new express();

const fs = require('fs');

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static('output'));

let maskFileId = null;

const twilio = require('twilio');
const {
    TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
    OPENAI_API_KEY
} = process.env;


const { OpenAI } = require('openai');
const openai = new OpenAI({
    apiKey: OPENAI_API_KEY
});



async function createFile(filePath) {
    const fileContent = fs.createReadStream(filePath);
    const result = await openai.files.create({
      file: fileContent,
      purpose: "vision",
    });
    return result.id;
}


const { downloadTwilioMedia, encodeImage } = require('./utils');

app.post('/message', async (req, res) => {

    const twiml = new twilio.twiml.MessagingResponse();
    console.log('x-forwarded-host', req.headers['x-forwarded-host']);

    // Your logic here    
    console.log('body', req.body);

    if (req.body.MessageType == 'image') {

        twiml.message('Sua imagem será processada em alguns minutos.');
        // twiml.message('Your picture will be processed in a few minutes.');
        res.send(twiml.toString());

        const base64Image = await downloadTwilioMedia(req.body.MediaUrl0);
        // const maskImageBase64 = await encodeImage('input/mask.png');

        // const PROMPT = `make me look like a cartoon. please ignore the background and focus only on the person or persons in front`;
        const PROMPT = `Utilize a primeira imagem como fundo e máscara e adicione a pessoa da segunda imagem como se fosse um anime.`

        console.log('maskFileId', maskFileId);
        const response = await openai.responses.create({
            model: "gpt-4o-mini",
            input: [
                {
                    role: "user",
                    content: [
                        { type: "input_text", text: PROMPT },
                        {
                            type: "input_image",
                            file_id: maskFileId,
                        },
                        // {
                        //     type: "input_image",
                        //     image_url: `data:image/png;base64,${maskImageBase64}`,
                        // },
                        {
                            type: "input_image",
                            image_url: `data:${base64Image.contentType};base64,${base64Image.base64}`,
                        },
                    ],
                },
            ],
            tools: [{ type: "image_generation" }],
        });

        console.log('response', response);

        const imageData = response.output
            .filter((output) => output.type === "image_generation_call")
            .map((output) => output.result);

        if (imageData.length > 0) {
            const imageBase64 = imageData[0];
            // Cria a pasta output se não existir
            if (!fs.existsSync('output')) {
                fs.mkdirSync('output');
            }
            // Save the image to a file (e.g., PNG)
            fs.writeFileSync(`output/${req.body.SmsMessageSid}.png`, Buffer.from(imageBase64, "base64"));

            // Send whatsapp message with image
            const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
            await twilioClient.messages.create({
                from: req.body.To,
                to: req.body.From, 
                // body: `Here is your picture`,
                body: `Aqui está sua imagem`,
                mediaUrl: `https://${req.headers['x-forwarded-host']}/${req.body.SmsMessageSid}.png`
            })

        } else {
            console.log(response.output.content);
        }

    } else {
        // twiml.message('Please send a picture to start.');
        twiml.message('Envie por favor sua selfie para começar.');
        res.send(twiml.toString());
    }


});


app.get('/', async (req, res) => {
    res.send('SITE FUNCIONAL')
});

const port = parseInt(process.env.PORT || '3001');
console.log('PORT RECEIVED', port)
app.listen(port, async () => {
    
    maskFileId = await createFile('input/mask.png');
    console.log('maskFileId', maskFileId);

    console.log(`Server running on port ${port}`);
});