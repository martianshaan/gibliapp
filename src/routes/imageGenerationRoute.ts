import { Router } from 'express';
import {
    createGenerationRequest,
    getGenerationRequests,
    getGenerationRequestById,
    cancelGenerationRequest
} from '../controllers/imageGenerationController';
//import { authenticateUser } from '../middleware/auth'; // Assuming you have this middleware

const router = Router();

// All routes require authentication
//router.use(authenticateUser);

// Submit a new image generation request
router.post('/generate', createGenerationRequest);

// Get list of user's generation requests
router.get('/generation-requests', getGenerationRequests);

// Get details of a specific generation request
router.get('/generation-requests/:request_id', getGenerationRequestById);

// Cancel a generation request
router.post('/generation-requests/:request_id/cancel', cancelGenerationRequest);

export default router;