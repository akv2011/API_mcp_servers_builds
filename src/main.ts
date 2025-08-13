import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { existsSync } from 'fs';

const logger = new Logger('Main');

async function bootstrap() {
  // @ts-expect-error BigInt.prototype.toJSON is not defined
  BigInt.prototype.toJSON = function (this: bigint): string {
    const int = Number.parseInt(this.toString());
    return int.toString() ?? this.toString();
  };

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Serve static files from the appropriate path
  // In development, files will be served from src/public
  // In production, files will be served from public (after being copied during build)
  const developmentPath = join(__dirname, '..', 'src', 'public');
  const productionPath = join(__dirname, '..', 'public');

  // First try development path, then production path
  if (existsSync(developmentPath)) {
    app.useStaticAssets(developmentPath);
  }

  // Also serve from production path if it exists
  if (existsSync(productionPath)) {
    app.useStaticAssets(productionPath);
  }

  // Enable validation pipe globally
  app.useGlobalPipes(
    new ValidationPipe({
      // whitelist: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Enable logging interceptor globally
  app.useGlobalInterceptors(new LoggingInterceptor(new Reflector()));

  // Configure Swagger
  const config = new DocumentBuilder()
    .setTitle('Matrix API')
    .setDescription(
      'Matrix API gives you access to multiple DeFi protocols.<br/>',
      // 'All endpoints require API key authentication.<br/><br/>' +
      // '<strong>To authorize:</strong><br/>' +
      // '1. Click the "Authorize" button at the top right<br/>' +
      // '2. Enter your API key (without Bearer prefix)<br/>' +
      // '3. Click "Authorize", then "Close"<br/><br/>',
    )
    .setVersion('2.0')
    .addTag('a-health', 'Health check and API status information')
    .addApiKey(
      {
        type: 'apiKey',
        name: 'Authorization',
        in: 'header',
        description:
          'Enter your API key directly WITHOUT adding Bearer prefix. The system will add it automatically.',
      },
      'api_key_auth',
    )
    .build();
  const document = SwaggerModule.createDocument(app, config);

  // Set up Swagger with Matrix theme
  SwaggerModule.setup('api-docs', app, document, {
    customSiteTitle: 'Matrix API Documentation',
    customCss: `
      .swagger-ui .topbar { display: none; }
      .swagger-ui { background-color: black; }
      .swagger-ui .opblock-summary-control:after { border-color: #0f0 transparent transparent !important; }
      .swagger-ui svg { fill: #0f0 !important; }
      
      /* Matrix Navigation - Hidden interactive element */
      @keyframes glitchText {
        0% { text-shadow: 0.05em 0 0 rgba(255,0,0,.75), -0.05em -0.025em 0 rgba(0,255,0,.75), 0.025em 0.05em 0 rgba(0,0,255,.75); }
        14% { text-shadow: 0.05em 0 0 rgba(255,0,0,.75), -0.05em -0.025em 0 rgba(0,255,0,.75), 0.025em 0.05em 0 rgba(0,0,255,.75); }
        15% { text-shadow: -0.05em -0.025em 0 rgba(255,0,0,.75), 0.025em 0.025em 0 rgba(0,255,0,.75), -0.05em -0.05em 0 rgba(0,0,255,.75); }
        49% { text-shadow: -0.05em -0.025em 0 rgba(255,0,0,.75), 0.025em 0.025em 0 rgba(0,255,0,.75), -0.05em -0.05em 0 rgba(0,0,255,.75); }
        50% { text-shadow: 0.025em 0.05em 0 rgba(255,0,0,.75), 0.05em 0 0 rgba(0,255,0,.75), 0 -0.05em 0 rgba(0,0,255,.75); }
        99% { text-shadow: 0.025em 0.05em 0 rgba(255,0,0,.75), 0.05em 0 0 rgba(0,255,0,.75), 0 -0.05em 0 rgba(0,0,255,.75); }
        100% { text-shadow: -0.025em 0 0 rgba(255,0,0,.75), -0.025em -0.025em 0 rgba(0,255,0,.75), -0.025em -0.05em 0 rgba(0,0,255,.75); }
      }
      
      /* Matrix escape key in the top left */
      .matrix-escape {
        position: fixed;
        top: 15px;
        left: 15px;
        font-family: monospace;
        font-size: 16px;
        font-weight: bold;
        color: rgba(0, 255, 0, 0.2);
        cursor: pointer;
        z-index: 9999;
        transition: all 0.3s ease;
        mix-blend-mode: screen;
        text-shadow: 0 0 2px rgba(0, 255, 0, 0.5);
        letter-spacing: 1px;
      }
      
      .matrix-escape:hover {
        color: #0f0;
        animation: glitchText 0.3s linear infinite;
      }
      
      /* Top Matrix characters - subtly appears when hovering near top left */
      .top-left-hover-area {
        position: fixed;
        top: 0;
        left: 0;
        width: 100px;
        height: 60px;
        z-index: 9998;
      }
      
      .top-left-hover-area:hover ~ .matrix-characters {
        opacity: 1;
      }
      
      .matrix-characters {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 40px;
        color: #0f0;
        font-family: monospace;
        font-size: 15px;
        overflow: hidden;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.5s ease;
        z-index: 9990;
        background-color: rgba(0,0,0,0.7);
        display: flex;
        align-items: center;
        justify-content: flex-start;
        padding-left: 10px;
        backdrop-filter: blur(5px);
        border-bottom: 1px solid rgba(0, 255, 0, 0.3);
      }
    `,
    customJs: '/matrix.js',
    customJsStr: `
      // Load swagger-fix.js to correct API key handling
      const swaggerFixScript = document.createElement('script');
      swaggerFixScript.src = '/swagger-fix.js';
      document.head.appendChild(swaggerFixScript);
    `,
    customCssUrl: '/matrix-theme.css',
    swaggerOptions: {
      docExpansion: 'list',
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
      defaultModelsExpandDepth: 1,
      defaultModelExpandDepth: 1,
      persistAuthorization: true,
    },
  });

  // Enable CORS
  app.enableCors();

  // Add security headers to allow loading of static assets
  app.use(
    (
      _req: any,
      res: { header: (arg0: string, arg1: string) => void },
      next: () => void,
    ) => {
      res.header(
        'Content-Security-Policy',
        "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; img-src 'self' data:; font-src 'self' data:",
      );
      res.header('X-Content-Type-Options', 'nosniff');
      next();
    },
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  logger.log(`Application is running on: http://localhost:${port}`);
  logger.log(
    `API documentation available at: http://localhost:${port}/api-docs`,
  );
}

bootstrap().catch((err) => {
  logger.error('Failed to start application:', err);
  process.exit(1);
});
