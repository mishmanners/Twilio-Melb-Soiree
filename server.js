
require('dotenv').config();

const express = require('express');
const app = new express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static('output'));


const twilio = require('twilio');
const {
    TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
    OPENAI_API_KEY
} = process.env;


const { downloadTwilioMedia } = require('./utils');

app.post('/message', async (req, res) => {

    const twiml = new twilio.twiml.MessagingResponse();

    // Your logic here    
    console.log('body', req.body);

    if (req.body.MessageType == 'image') {

        twiml.message('Your picture will be processed in a few minutes.');
        res.send(twiml.toString());

        const base64Image = await downloadTwilioMedia(req.body.MediaUrl0);

        console.log('base64', base64Image);

        const PROMPT = `make me look like a cartoon. please ignore the background and focus only on the person or persons in front`;

        const { OpenAI } = require('openai');
        const openai = new OpenAI({
            apiKey: OPENAI_API_KEY
        });

        const response = await openai.responses.create({
            model: "gpt-4o-mini",
            input: [
                {
                    role: "user",
                    content: [
                        { type: "input_text", text: PROMPT },
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
            const fs = await import("fs");
            fs.writeFileSync(`output/${req.body.SmsMessageSid}.png`, Buffer.from(imageBase64, "base64"));

            // Send whatsapp message with image
            const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
            await twilioClient.messages.create({
                from: req.body.To,
                to: req.body.From, 
                body: `Here is your picture`,
                mediaUrl: `${req.protocol}://${req.headers['x-forwarded-host']}/${req.body.SmsMessageSid}.png`
            })

        } else {
            console.log(response.output.content);
        }

    } else {
        twiml.message('Please send a picture to start.');
        res.send(twiml.toString());
    }


});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});