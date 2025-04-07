import { Router } from 'express';
import { getActiveModels } from '../controllers/modelController';
//import { authenticateUser } from '../middleware/auth'; // Assuming you have auth middleware

const ModelRouter = Router();

// AI Models routes
ModelRouter.get('/', getActiveModels); // Public access to models
// If you want to require authentication:
// router.get('/models', authenticateUser, getActiveModels);

export default ModelRouter;