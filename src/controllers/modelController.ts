import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getActiveModels = async (req: Request, res: Response) => {
    try {
        const models = await prisma.aiModel.findMany({
            where: {
                isActive: true
            },
            select: {
                id: true,
                modelName: true,
                apiIdentifier: true,
                description: true,
                costPerRequest: true,
                provider: {
                    select: {
                        name: true,
                        websiteUrl: true
                    }
                }
            },
            orderBy: {
                provider: {
                    name: 'asc'
                }
            }
        });

        // Transform the data to match the expected response format
        const formattedModels = models.map(model => ({
            model_id: model.id,
            name: model.modelName,
            api_identifier: model.apiIdentifier,
            description: model.description,
            provider: model.provider.name,
            provider_website: model.provider.websiteUrl,
            cost_indicator: model.costPerRequest
        }));

        return res.status(200).json({
            success: true,
            data: formattedModels
        });
    } catch (error) {
        console.error('Error fetching AI models:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch AI models',
            error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
        });
    }
};