import { Controller, Get, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';
import { NoLogging } from './common/decorators/no-logging.decorator';
import { Public } from './common/decorators/public.decorator';
import { Request, Response } from 'express';

@ApiTags('a-health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @Public()
  @NoLogging()
  @ApiOperation({ summary: 'API Health Check - Verify Service Status' })
  @ApiResponse({
    status: 200,
    description: 'Returns a welcome message indicating the API is running',
    schema: {
      type: 'string',
      example: 'Welcome to Matrix API!',
    },
  })
  getHello(@Req() req: Request, @Res() res: Response): any {
    const acceptHeader = req.headers.accept || '';

    // Check if the client accepts HTML (browser)
    if (acceptHeader.includes('text/html')) {
      // Return HTML with Matrix effect
      const matrixText = this.appService.getHello();
      const htmlResponse = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Matrix API</title>
        <style>
          body {
            background-color: #000;
            color: #0f0;
            font-family: monospace;
            padding: 20px;
            margin: 0;
            overflow: hidden;
            position: relative;
          }
          pre {
            font-size: 20px;
            white-space: pre;
            line-height: 1.3;
            position: relative;
            z-index: 10;
            background-color: rgba(0, 0, 0, 0.85);
            padding: 30px;
            border-radius: 8px;
            margin: 80px auto;
            max-width: 900px;
            box-shadow: 0 0 30px rgba(0, 255, 0, 0.5);
          }
          canvas {
            position: absolute;
            top: 0;
            left: 0;
            z-index: 1;
          }
          .welcome-text {
            text-align: center;
            font-size: 18px;
            font-weight: bold;
            margin: 20px 0;
            text-shadow: 0 0 8px #0f0;
          }
          .enter-button-container {
            text-align: center;
            margin-top: 40px;
            position: relative;
            z-index: 20;
          }
          .enter-button {
            display: inline-block;
            padding: 12px 24px;
            background-color: rgba(0, 0, 0, 0.7);
            border: 2px solid #0f0;
            color: #0f0;
            font-family: monospace;
            font-size: 18px;
            font-weight: bold;
            text-decoration: none;
            border-radius: 4px;
            box-shadow: 0 0 15px rgba(0, 255, 0, 0.7);
            text-shadow: 0 0 10px #0f0;
            cursor: pointer;
            transition: all 0.3s ease;
            text-transform: uppercase;
            letter-spacing: 2px;
            animation: pulse 1.5s infinite alternate;
          }
          .enter-button:hover {
            background-color: rgba(0, 50, 0, 0.8);
            box-shadow: 0 0 25px rgba(0, 255, 0, 0.9);
            text-shadow: 0 0 15px #0f0;
            transform: scale(1.05);
            animation-play-state: paused;
          }
          @keyframes pulse {
            0% {
              box-shadow: 0 0 15px rgba(0, 255, 0, 0.7);
              text-shadow: 0 0 10px #0f0;
            }
            100% {
              box-shadow: 0 0 25px rgba(0, 255, 0, 1);
              text-shadow: 0 0 15px #0f0;
            }
          }
        </style>
      </head>
      <body>
        <canvas id="matrix"></canvas>
        <pre>${matrixText}</pre>
        
        <div class="enter-button-container">
          <a href="/api-docs" class="enter-button">Enter The Matrix</a>
        </div>

        <script>
          // Matrix Digital Rain Animation
          const canvas = document.getElementById('matrix');
          const ctx = canvas.getContext('2d');

          // Set canvas dimensions to full window
          canvas.height = window.innerHeight;
          canvas.width = window.innerWidth;

          // Characters to use in the rain
          const matrixChars = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
          
          // Convert string to array of characters
          const characters = matrixChars.split('');
          
          // Font size
          const fontSize = 14;
          
          // Calculate number of columns based on canvas width and font size
          const columns = canvas.width / fontSize;
          
          // Create an array to track the y position of each drop
          const drops = [];
          
          // Initialize all drops to start at random positions above the screen
          for (let i = 0; i < columns; i++) {
            drops[i] = Math.random() * -100;
          }

          // Draw the animation
          function draw() {
            // Add semi-transparent black rectangle to create fade effect
            ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Set text color to Matrix green with varying opacities
            ctx.fillStyle = '#0f0';
            ctx.font = fontSize + 'px monospace';
            
            // Loop through drops
            for (let i = 0; i < drops.length; i++) {
              // Pick a random character
              const text = characters[Math.floor(Math.random() * characters.length)];
              
              // Vary the brightness of the characters
              const opacity = Math.random() * 0.5 + 0.5;
              ctx.fillStyle = 'rgba(0, 255, 0, ' + opacity + ')';
              
              // Draw the character
              ctx.fillText(text, i * fontSize, drops[i] * fontSize);
              
              // Move the drop down
              drops[i]++;
              
              // Reset the drop if it's below screen or randomly
              if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
                drops[i] = 0;
              }
            }
          }

          // Update canvas size when window is resized
          window.addEventListener('resize', () => {
            canvas.height = window.innerHeight;
            canvas.width = window.innerWidth;
            // Recalculate columns
            const newColumns = canvas.width / fontSize;
            // Adjust drops array if columns changed
            if (newColumns > drops.length) {
              for (let i = drops.length; i < newColumns; i++) {
                drops[i] = Math.random() * -100;
              }
            }
          });

          // Add some special effects to the button
          const enterButton = document.querySelector('.enter-button');
          enterButton.addEventListener('mouseover', () => {
            // Randomize characters in the button text when hovering
            let originalText = "Enter The Matrix";
            let interval = setInterval(() => {
              let newText = "";
              for (let i = 0; i < originalText.length; i++) {
                if (Math.random() > 0.7 && originalText[i] !== ' ') {
                  const randomChar = characters[Math.floor(Math.random() * characters.length)];
                  newText += randomChar;
                } else {
                  newText += originalText[i];
                }
              }
              enterButton.textContent = newText;
            }, 100);
            
            enterButton.addEventListener('mouseout', () => {
              clearInterval(interval);
              enterButton.textContent = "Enter The Matrix";
            });
          });

          // Add click effect for button
          enterButton.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Create glitch effect on the entire screen
            document.body.style.overflow = 'hidden';
            
            // Create glitch overlay
            const glitchOverlay = document.createElement('div');
            glitchOverlay.style.position = 'fixed';
            glitchOverlay.style.top = '0';
            glitchOverlay.style.left = '0';
            glitchOverlay.style.width = '100%';
            glitchOverlay.style.height = '100%';
            glitchOverlay.style.backgroundColor = 'black';
            glitchOverlay.style.zIndex = '100';
            glitchOverlay.style.opacity = '0';
            document.body.appendChild(glitchOverlay);
            
            // Matrix loading messages
            const loadingMessages = [
              "Wake up, Neo...",
              "The Matrix has you...",
              "Follow the white rabbit...",
              "Knock, knock, Neo...",
              "Loading simulation..."
            ];
            
            // Flash effect
            let flashes = 0;
            const maxFlashes = 5;
            const flashInterval = setInterval(() => {
              if (flashes >= maxFlashes) {
                clearInterval(flashInterval);
                
                // Store a flag in sessionStorage to indicate we're navigating away
                // This will help with handling back button navigation
                sessionStorage.setItem('matrixTransition', 'true');
                
                // Use history.pushState instead of replacing the location
                // to preserve proper back button functionality
                window.location.href = '/api-docs';
                return;
              }
              
              glitchOverlay.style.opacity = flashes % 2 === 0 ? '1' : '0';
              
              // Random code display during flashes
              if (flashes % 2 === 0) {
                const codeLines = [];
                for (let i = 0; i < 10; i++) {
                  let line = '';
                  for (let j = 0; j < 50; j++) {
                    line += characters[Math.floor(Math.random() * characters.length)];
                  }
                  codeLines.push(line);
                }
                
                // Add a Matrix loading message
                const loadingMessage = loadingMessages[flashes % loadingMessages.length];
                
                glitchOverlay.innerHTML = '<pre style="color:#0f0;font-family:monospace;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-shadow:0 0 10px #0f0;">' + 
                  codeLines.join('\\n') + '\\n\\n' + loadingMessage + '</pre>';
              }
              
              flashes++;
            }, 100);
          });

          // Handle page load and check if we're coming back from /api-docs
          window.addEventListener('pageshow', function(event) {
            // If the page is loaded from the cache (back button)
            if (event.persisted) {
              document.body.style.overflow = 'auto'; // Ensure scroll is enabled
              // Remove any glitch overlays that might be present
              const overlays = document.querySelectorAll('div[style*="z-index: 100"]');
              overlays.forEach(overlay => overlay.remove());
            }
          });

          // Run the animation
          setInterval(draw, 33); // ~30fps
        </script>
      </body>
      </html>
      `;

      res.setHeader('Content-Type', 'text/html');
      return res.send(htmlResponse);
    }

    // Otherwise return plain text for API clients
    const welcomeText = this.appService.getHello();
    res.setHeader('Content-Type', 'text/plain');
    return res.send(welcomeText);
  }

  @Get('test-auth')
  @ApiOperation({ summary: 'Test API key authentication' })
  @ApiResponse({
    status: 200,
    description: 'Returns success if API key is valid',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        message: { type: 'string', example: 'API key is valid' },
        apiKeyInfo: { 
          type: 'object',
          properties: {
            id: { type: 'string' },
            user_id: { type: 'string' },
            status: { type: 'string' }
          }
        }
      }
    }
  })
  testAuth(@Req() req: any): object {
    // Return info about the API key from the request
    return {
      status: 'success',
      message: 'API key is valid',
      apiKeyInfo: {
        id: req.apiKeyData?.id,
        user_id: req.apiKeyData?.user_id,
        status: req.apiKeyData?.status
      }
    };
  }
}
