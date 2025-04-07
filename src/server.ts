import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import ModelRouter from './routes/modelRoutes'
import imageGenerationRouter from './routes/imageGenerationRoute'
//import routes from './routes';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/api/models', ModelRouter)
app.use('/api/images', imageGenerationRouter)

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// API routes
//app.use('/api', routes);

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something broke!' });
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
