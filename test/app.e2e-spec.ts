import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Morpho', () => {
    it('/beta/v0/morpho/position/:chain/:positionId/:account (GET)', async () => {
      try {
        const response = await request(app.getHttpServer())
          .get(
            '/beta/v0/morpho/position/optimism/0xb323495f7e4148be5643a4ea4a8221eef163e4bccfdedc2a6f4696baacbc86cc/0x7f65e7326F22963e2039734dDfF61958D5d284Ca',
          )
          .expect(200);

        expect(response.body.position).toBeDefined();
        expect(response.body.position.id).toBeDefined();
        expect(response.body.position.account).toBeDefined();
      } catch (error) {
        // Log the error for debugging
        console.error('Test failed:', error);
        throw error;
      }
    });
  });
});
