require('dotenv').config();

// TODO: create output folder

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

        twiml.message('Your image will be processed in a few minutes.');
        res.send(twiml.toString());

        const base64Image = await downloadTwilioMedia(req.body.MediaUrl0);
        const maskImageBase64 = await encodeImage('input/mask.png');

        const PROMPT = `Create a wholesome, hand-drawn caricature-style drawing of the person(s) in the photo. Black and white lined drawing, and use one standout color: red. Exaggerate features, and use minimal background, 2D flat shading. Focus on character and charm. Consider a transparent background, but make sure the body or any part of the people aren't transparent. Don't add any text overlay that could be on the original picture, unless it's something they are wearing. Person's face and body and eyes needs to have some color. Any part of the person or anything or any object on the image should not be transparent. Don't add any new person if the picture doesn't have it.`;

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
                        {
                            type: "input_image",
                            image_url: `data:image/png;base64,${maskImageBase64}`,
                        },
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
            // Create output folder if it doesn't exist
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
                body: `Your new caricature-style drawing is ready.`,
                mediaUrl: `https://${req.headers['x-forwarded-host']}/${req.body.SmsMessageSid}.png`
            })

        } else {
            console.log(response.output.content);
        }

    } else {
        twiml.message('Please send a photo to start.');
        res.send(twiml.toString());
    }


});


// API endpoint to get list of all images
app.get('/api/images', async (req, res) => {
    try {
        if (!fs.existsSync('output')) {
            return res.json([]);
        }
        
        const files = fs.readdirSync('output')
            .filter(file => file.toLowerCase().endsWith('.png'))
            .map(file => ({
                name: file,
                url: `/${file}`,
                created: fs.statSync(`output/${file}`).birthtime
            }))
            .sort((a, b) => new Date(b.created) - new Date(a.created)); // Most recent first
        
        res.json(files);
    } catch (error) {
        console.error('Error reading images:', error);
        res.status(500).json({ error: 'Failed to load images' });
    }
});

app.get('/', async (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cartoon Gallery - AI Generated Images</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Arial', sans-serif;
            background: linear-gradient(135deg, #1e3a8a 0%, #dc2626 100%);
            min-height: 100vh;
            padding: 20px;
        }
        
        .header {
            text-align: center;
            color: white;
            margin-bottom: 40px;
        }
        
        .header h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }
        
        .header p {
            font-size: 1.2rem;
            opacity: 0.9;
        }
        
        .carousel-container {
            max-width: 800px;
            margin: 0 auto;
            position: relative;
            background: white;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            overflow: hidden;
            border: 3px solid #1e3a8a;
        }
        
        .carousel {
            position: relative;
            height: 500px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .carousel img {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
            border-radius: 10px;
            transition: opacity 0.5s ease-in-out;
        }
        
        .carousel-nav {
            position: absolute;
            top: 50%;
            transform: translateY(-50%);
            background: #dc2626;
            color: white;
            border: none;
            padding: 15px 20px;
            font-size: 18px;
            cursor: pointer;
            border-radius: 50%;
            transition: background 0.3s;
        }
        
        .carousel-nav:hover {
            background: #b91c1c;
        }
        
        .carousel-nav:disabled {
            opacity: 0.3;
            cursor: not-allowed;
            background: #6b7280;
        }
        
        .prev {
            left: 20px;
        }
        
        .next {
            right: 20px;
        }
        
        .carousel-info {
            text-align: center;
            padding: 20px;
            background: #f8fafc;
            border-top: 1px solid #1e3a8a;
        }
        
        .image-counter {
            font-size: 1.1rem;
            font-weight: bold;
            color: #1e3a8a;
            margin-bottom: 10px;
        }
        
        .image-date {
            color: #dc2626;
            font-size: 0.9rem;
        }
        
        .dots-container {
            text-align: center;
            padding: 15px;
            background: #1e3a8a;
        }
        
        .dot {
            display: inline-block;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: white;
            margin: 0 5px;
            cursor: pointer;
            transition: background 0.3s;
        }
        
        .dot.active {
            background: #dc2626;
        }
        
        .loading {
            text-align: center;
            padding: 50px;
            color: #1e3a8a;
        }
        
        .no-images {
            text-align: center;
            padding: 50px;
            color: #1e3a8a;
        }
        
        .no-images h3 {
            margin-bottom: 15px;
            color: #1e3a8a;
        }
        
        .refresh-btn {
            background: #dc2626;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 1rem;
            margin-top: 20px;
        }
        
        .refresh-btn:hover {
            background: #b91c1c;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🎨 AI Cartoon Gallery</h1>
        <p>Generated anime-style images from WhatsApp bot</p>
    </div>
    
    <div class="carousel-container">
        <div id="loading" class="loading">
            <p>Loading images...</p>
        </div>
        
        <div id="no-images" class="no-images" style="display: none;">
            <h3>No images found</h3>
            <p>Send a selfie to the WhatsApp bot to generate your first cartoon!</p>
            <button class="refresh-btn" onclick="loadImages()">Refresh</button>
        </div>
        
        <div id="carousel" class="carousel" style="display: none;">
            <button class="carousel-nav prev" id="prevBtn" onclick="changeImage(-1)">❮</button>
            <img id="currentImage" src="" alt="Generated cartoon" />
            <button class="carousel-nav next" id="nextBtn" onclick="changeImage(1)">❯</button>
        </div>
        
        <div id="carousel-info" class="carousel-info" style="display: none;">
            <div class="image-counter" id="imageCounter"></div>
            <div class="image-date" id="imageDate"></div>
        </div>
        
        <div id="dots-container" class="dots-container" style="display: none;"></div>
    </div>
    
    <script>
        let images = [];
        let currentIndex = 0;
        let autoAdvanceInterval = null;
        
        async function loadImages() {
            try {
                const response = await fetch('/api/images');
                images = await response.json();
                
                document.getElementById('loading').style.display = 'none';
                
                if (images.length === 0) {
                    document.getElementById('no-images').style.display = 'block';
                } else {
                    document.getElementById('carousel').style.display = 'flex';
                    document.getElementById('carousel-info').style.display = 'block';
                    document.getElementById('dots-container').style.display = 'block';
                    setupCarousel();
                }
            } catch (error) {
                console.error('Failed to load images:', error);
                document.getElementById('loading').innerHTML = '<p>Failed to load images. Please refresh the page.</p>';
            }
        }
        
        function setupCarousel() {
            createDots();
            showImage(0);
            startAutoAdvance();
        }
        
        function startAutoAdvance() {
            // Clear any existing interval
            if (autoAdvanceInterval) {
                clearInterval(autoAdvanceInterval);
            }
            
            // Only start auto-advance if there are multiple images
            if (images.length > 1) {
                autoAdvanceInterval = setInterval(() => {
                    const nextIndex = (currentIndex + 1) % images.length;
                    showImage(nextIndex);
                }, 5000); // 5 seconds
            }
        }
        
        function stopAutoAdvance() {
            if (autoAdvanceInterval) {
                clearInterval(autoAdvanceInterval);
                autoAdvanceInterval = null;
            }
        }
        
        function createDots() {
            const dotsContainer = document.getElementById('dots-container');
            dotsContainer.innerHTML = '';
            
            images.forEach((_, index) => {
                const dot = document.createElement('span');
                dot.className = 'dot';
                dot.onclick = () => {
                    // Stop auto-advance when user clicks dot
                    stopAutoAdvance();
                    showImage(index);
                    // Restart auto-advance after manual interaction
                    setTimeout(startAutoAdvance, 3000); // Wait 3 seconds before resuming
                };
                dotsContainer.appendChild(dot);
            });
        }
        
        function showImage(index) {
            if (images.length === 0) return;
            
            currentIndex = index;
            const image = images[currentIndex];
            
            document.getElementById('currentImage').src = image.url;
            document.getElementById('imageCounter').textContent = \`\${currentIndex + 1} of \${images.length}\`;
            document.getElementById('imageDate').textContent = new Date(image.created).toLocaleString();
            
            // Update navigation buttons
            document.getElementById('prevBtn').disabled = currentIndex === 0;
            document.getElementById('nextBtn').disabled = currentIndex === images.length - 1;
            
            // Update dots
            document.querySelectorAll('.dot').forEach((dot, i) => {
                dot.classList.toggle('active', i === currentIndex);
            });
        }
        
        function changeImage(direction) {
            const newIndex = currentIndex + direction;
            if (newIndex >= 0 && newIndex < images.length) {
                // Stop auto-advance when user manually navigates
                stopAutoAdvance();
                showImage(newIndex);
                // Restart auto-advance after manual interaction
                setTimeout(startAutoAdvance, 3000); // Wait 3 seconds before resuming
            }
        }
        
        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') changeImage(-1);
            if (e.key === 'ArrowRight') changeImage(1);
        });
        
        // Pause auto-advance on hover, resume on mouse leave
        document.addEventListener('DOMContentLoaded', () => {
            const carouselContainer = document.querySelector('.carousel-container');
            if (carouselContainer) {
                carouselContainer.addEventListener('mouseenter', stopAutoAdvance);
                carouselContainer.addEventListener('mouseleave', startAutoAdvance);
            }
        });
        
        // Auto-refresh every 30 seconds
        setInterval(loadImages, 30000);
        
        // Load images on page load
        loadImages();
    </script>
</body>
</html>
    `);
});

const port = parseInt(process.env.PORT || '3001');
console.log('PORT RECEIVED', port)
app.listen(port, async () => {
    
    maskFileId = await createFile('input/mask.png');
    console.log('maskFileId', maskFileId);

    console.log(`Server running on port ${port}`);
});