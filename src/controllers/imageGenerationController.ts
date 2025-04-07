import { Request, Response } from 'express';
import { PrismaClient, RequestStatus } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

// Validation schema for generation request
const GenerationRequestSchema = z.object({
    model_id: z.number(),
    prompt: z.string().min(1).max(1000),
    negative_prompt: z.string().optional(),
    aspect_ratio: z.string().optional(),
    num_outputs: z.number().int().min(1).max(4).default(1),
    style_preset: z.string().optional(),
    seed: z.number().optional(),
    quality: z.string().optional(),
    api_specific_parameters: z.record(z.any()).optional(),
});

// Submit a new image generation request
export const createGenerationRequest = async (req: Request, res: Response) => {
    try {
        // Get user ID from auth middleware
        const userId = (req as any).user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        // Validate request body
        const validationResult = GenerationRequestSchema.safeParse(req.body);
        if (!validationResult.success) {
            return res.status(400).json({
                success: false,
                message: 'Invalid request parameters',
                errors: validationResult.error.format()
            });
        }

        const data = validationResult.data;

        // Check if model exists and is active
        const model = await prisma.aiModel.findFirst({
            where: {
                id: data.model_id,
                isActive: true
            }
        });

        if (!model) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or inactive model selected'
            });
        }

        // Check user credits (simplified - you'll need to implement proper credit checking)
        const userCredits = await prisma.userCredit.findMany({
            where: { userId },
            orderBy: { transactionTime: 'desc' },
            take: 1
        });

        const currentBalance = userCredits.length > 0 ? userCredits[0].balanceAfter : 0;
        const requiredCredits = data.num_outputs * (model.costPerRequest?.toNumber() || 1);

        if (currentBalance < requiredCredits) {
            return res.status(402).json({
                success: false,
                message: 'Insufficient credits',
                required: requiredCredits,
                available: currentBalance
            });
        }

        // Create generation request
        const generationRequest = await prisma.generationRequest.create({
            data: {
                userId,
                modelId: data.model_id,
                prompt: data.prompt,
                negativePrompt: data.negative_prompt,
                aspectRatio: data.aspect_ratio,
                stylePreset: data.style_preset,
                seed: data.seed ? BigInt(data.seed) : undefined,
                numOutputs: data.num_outputs,
                quality: data.quality,
                apiSpecificParameters: data.api_specific_parameters,
                status: RequestStatus.pending,
                creditsCharged: Number(requiredCredits)
            }
        });

        // Record credit transaction
        await prisma.userCredit.create({
            data: {
                userId,
                requestId: generationRequest.id,
                transactionType: 'consumption',
                amount: -Number(requiredCredits),
                balanceAfter: currentBalance - Number(requiredCredits),
                notes: `Credit deduction for generation request ${generationRequest.id}`
            }
        });

        // In a real implementation, you would now trigger the actual generation process
        // This could be done via a queue system, webhook, or direct API call

        return res.status(202).json({
            success: true,
            message: 'Generation request accepted',
            request_id: generationRequest.id
        });
    } catch (error) {
        console.error('Error creating generation request:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to create generation request',
            error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
        });
    }
};

// Get list of user's generation requests
export const getGenerationRequests = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        // Parse query parameters
        const limit = parseInt(req.query.limit as string) || 20;
        const offset = parseInt(req.query.offset as string) || 0;
        const status = req.query.status as RequestStatus | undefined;
        const modelId = req.query.model_id ? parseInt(req.query.model_id as string) : undefined;

        // Build where clause
        const where: any = { userId };
        if (status) where.status = status;
        if (modelId) where.modelId = modelId;

        // Get total count for pagination
        const totalCount = await prisma.generationRequest.count({ where });

        // Get requests
        const requests = await prisma.generationRequest.findMany({
            where,
            include: {
                model: {
                    select: {
                        modelName: true,
                        provider: {
                            select: { name: true }
                        }
                    }
                },
                images: {
                    select: {
                        id: true,
                        imageUrl: true,
                        thumbnailUrl: true
                    }
                }
            },
            orderBy: { requestedAt: 'desc' },
            skip: offset,
            take: limit
        });

        // Format response
        const formattedRequests = requests.map(req => ({
            request_id: req.id,
            status: req.status,
            prompt: req.prompt,
            negative_prompt: req.negativePrompt,
            model: {
                id: req.modelId,
                name: req.model.modelName,
                provider: req.model.provider.name
            },
            created_at: req.requestedAt,
            completed_at: req.completedAt,
            image_count: req.images.length,
            image_previews: req.images.slice(0, 2).map(img => ({
                id: img.id,
                thumbnail: img.thumbnailUrl || img.imageUrl
            }))
        }));

        return res.status(200).json({
            success: true,
            data: formattedRequests,
            pagination: {
                total: totalCount,
                limit,
                offset,
                has_more: offset + requests.length < totalCount
            }
        });
    } catch (error) {
        console.error('Error fetching generation requests:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch generation requests',
            error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
        });
    }
};

// Get details of a specific generation request
export const getGenerationRequestById = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        const requestId = req.params.request_id;

        const request = await prisma.generationRequest.findFirst({
            where: {
                id: requestId,
                userId
            },
            include: {
                model: {
                    select: {
                        modelName: true,
                        apiIdentifier: true,
                        provider: {
                            select: { name: true }
                        }
                    }
                },
                images: true,
                creditTransactions: {
                    select: {
                        amount: true,
                        transactionType: true,
                        transactionTime: true
                    }
                }
            }
        });

        if (!request) {
            return res.status(404).json({
                success: false,
                message: 'Generation request not found'
            });
        }

        // Format response
        const formattedRequest = {
            request_id: request.id,
            status: request.status,
            prompt: request.prompt,
            negative_prompt: request.negativePrompt,
            aspect_ratio: request.aspectRatio,
            style_preset: request.stylePreset,
            seed: request.seed ? Number(request.seed) : null,
            num_outputs: request.numOutputs,
            quality: request.quality,
            model: {
                id: request.modelId,
                name: request.model.modelName,
                provider: request.model.provider.name,
                api_identifier: request.model.apiIdentifier
            },
            created_at: request.requestedAt,
            processing_started_at: request.processingStartedAt,
            completed_at: request.completedAt,
            credits_charged: request.creditsCharged,
            error_message: request.errorMessage,
            images: request.images.map(img => ({
                image_id: img.id,
                url: img.imageUrl,
                thumbnail: img.thumbnailUrl,
                width: img.width,
                height: img.height,
                format: img.format,
                is_favorited: img.isFavorited
            })),
            api_specific_parameters: request.apiSpecificParameters
        };

        return res.status(200).json({
            success: true,
            data: formattedRequest
        });
    } catch (error) {
        console.error('Error fetching generation request details:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch generation request details',
            error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
        });
    }
};

// Cancel a generation request
export const cancelGenerationRequest = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        const requestId = req.params.request_id;

        // Get the request
        const request = await prisma.generationRequest.findFirst({
            where: {
                id: requestId,
                userId
            }
        });

        if (!request) {
            return res.status(404).json({
                success: false,
                message: 'Generation request not found'
            });
        }

        // Check if request can be cancelled
        if (request.status === RequestStatus.completed || request.status === RequestStatus.failed) {
            return res.status(400).json({
                success: false,
                message: `Cannot cancel request with status: ${request.status}`
            });
        }

        // Update request status
        await prisma.generationRequest.update({
            where: { id: requestId },
            data: {
                status: RequestStatus.failed,
                errorMessage: 'Cancelled by user',
                completedAt: new Date()
            }
        });

        // Refund credits if needed
        if (request.creditsCharged > 0) {
            const userCredits = await prisma.userCredit.findMany({
                where: { userId },
                orderBy: { transactionTime: 'desc' },
                take: 1
            });

            const currentBalance = userCredits.length > 0 ? userCredits[0].balanceAfter : 0;

            await prisma.userCredit.create({
                data: {
                    userId,
                    requestId: request.id,
                    transactionType: 'refund',
                    amount: request.creditsCharged,
                    balanceAfter: currentBalance + request.creditsCharged,
                    notes: `Credit refund for cancelled request ${request.id}`
                }
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Generation request cancelled successfully',
            refunded_credits: request.creditsCharged
        });
    } catch (error) {
        console.error('Error cancelling generation request:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to cancel generation request',
            error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
        });
    }
};