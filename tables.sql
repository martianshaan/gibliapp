-- Users Table
CREATE TABLE users (
    userId UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- Or BIGSERIAL PRIMARY KEY
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    passwordHash VARCHAR(255) NOT NULL, -- Store hashed passwords only!
    subscriptionTier NOT NULL DEFAULT 'free',
    createdAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    lastLoginAt TIMESTAMPTZ,
    isActive BOOLEAN NOT NULL DEFAULT TRUE
);

-- API Providers Table (Google, OpenAI, etc.)
CREATE TABLE api_providers (
    providerId SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL, -- e.g., 'Google', 'OpenAI'
    websiteUrl VARCHAR(255),
    createdAt TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- AI Models Table (Specific models like Gemini, DALL-E 3)
CREATE TABLE ai_models (
    modelId SERIAL PRIMARY KEY,
    providerId INT NOT NULL REFERENCES api_providers(providerId),
    modelName VARCHAR(100) NOT NULL, -- e.g., 'Gemini Pro Vision', 'DALL-E 3', 'GPT-4.5 Turbo Vision' (hypothetical)
    apiIdentifier VARCHAR(100) NOT NULL UNIQUE, -- The identifier used in API calls (e.g., 'gemini-pro-vision', 'dall-e-3')
    description TEXT,
    isActive BOOLEAN NOT NULL DEFAULT TRUE, -- Can this model currently be used?
    costPerRequest NUMERIC(10, 4) DEFAULT 0.00, -- Optional: Base cost reference (actual cost might vary)
    createdAt TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Generation Requests Table
CREATE TABLE generation_requests (
    requestId UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    userId UUID NOT NULL REFERENCES users(userId) ON DELETE CASCADE, -- If user is deleted, remove their requests
    modelId INT NOT NULL REFERENCES ai_models(modelId),
    prompt TEXT NOT NULL,
    negativePrompt TEXT, -- Optional: Things to avoid in the image
    aspectRatio VARCHAR(10), -- e.g., '16:9', '1:1', '9:16'
    stylePreset VARCHAR(100), -- Optional: e.g., 'photorealistic', 'anime', 'cinematic'
    seed BIGINT, -- Optional: For reproducibility if supported by the API
    numOutputs INT NOT NULL DEFAULT 1, -- How many images were requested for this prompt
    quality VARCHAR(20), -- Optional: e.g., 'standard', 'hd' (API specific)
    status request_status NOT NULL DEFAULT 'pending',
    apiSpecificParameters JSONB, -- Store any extra parameters sent to the specific API (flexible)
    errorMessage TEXT, -- Store error details if status is 'failed'
    creditsCharged INT DEFAULT 0, -- How many credits this request cost the user
    requestedAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processingStartedAt TIMESTAMPTZ,
    completedAt TIMESTAMPTZ
);

-- Generated Images Table
CREATE TABLE generated_images (
    imageId UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requestId UUID NOT NULL REFERENCES generation_requests(requestId) ON DELETE CASCADE, -- If request is deleted, remove its images
    userId UUID NOT NULL REFERENCES users(userId) ON DELETE CASCADE, -- Denormalized for easier user-image queries, ensure consistency via triggers or application logic
    imageUrl VARCHAR(1024) NOT NULL UNIQUE, -- URL to the image in object storage (S3, GCS, etc.)
    thumbnailUrl VARCHAR(1024), -- Optional: URL to a smaller thumbnail
    storageProvider VARCHAR(50), -- e.g., 'S3', 'GCS', 'LocalStorage'
    storagePath VARCHAR(1024), -- Path within the storage provider
    altText TEXT, -- Optional: Maybe derived from the prompt
    width INT,
    height INT,
    format image_format,
    sizeBytes BIGINT,
    apiResponseMetadata JSONB, -- Store any specific metadata returned by the API for this image
    isFavorited BOOLEAN NOT NULL DEFAULT FALSE, -- User interaction flag
    isPublic BOOLEAN NOT NULL DEFAULT FALSE, -- Sharing flag
    generatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW() -- Usually matches request completion, but could differ slightly
);

-- User Credits Table (Optional, for tracking usage/payments)
CREATE TABLE user_credits (
    transactionId UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    userId UUID NOT NULL REFERENCES users(userId) ON DELETE CASCADE,
    requestId UUID REFERENCES generation_requests(requestId) ON DELETE SET NULL, -- Link to the request that consumed/refunded credits (nullable)
    transactionType credit_transaction_type NOT NULL,
    amount INT NOT NULL, -- Positive for adding credits, negative for spending
    balanceAfter INT NOT NULL, -- Current balance after this transaction
    notes TEXT, -- e.g., 'Monthly bonus', 'Purchase ID: xyz'
    transactionTime TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- --------- Indexes for Performance ----------

-- Users
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);

-- AI Models
CREATE INDEX idx_ai_models_provider_id ON ai_models(providerId);
CREATE INDEX idx_ai_models_api_identifier ON ai_models(apiIdentifier);

-- Generation Requests
CREATE INDEX idx_generation_requests_user_id ON generation_requests(userId);
CREATE INDEX idx_generation_requests_model_id ON generation_requests(modelId);
CREATE INDEX idx_generation_requests_status ON generation_requests(status);
CREATE INDEX idx_generation_requests_requested_at ON generation_requests(requestedAt);

-- Generated Images
CREATE INDEX idx_generated_images_request_id ON generated_images(requestId);
CREATE INDEX idx_generated_images_user_id ON generated_images(userId); -- Important if querying images by user directly
CREATE INDEX idx_generated_images_generated_at ON generated_images(generatedAt);
CREATE INDEX idx_generated_images_is_favorited ON generated_images(userId, isFavorited) WHERE isFavorited = TRUE; -- Example partial index

-- User Credits
CREATE INDEX idx_user_credits_user_id ON user_credits(userId);
CREATE INDEX idx_user_credits_request_id ON user_credits(requestId);
CREATE INDEX idx_user_credits_transaction_time ON user_credits(transactionTime);


-- --------- Optional: Trigger for updated_at ----------
-- (Create similar triggers for other tables like generation_requests if needed)

CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updatedAt = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_timestamp_users
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

-- --------- Optional: Insert initial data for providers/models ----------

INSERT INTO api_providers (name, website_url) VALUES
('Google', 'https://ai.google.dev/'),
('OpenAI', 'https://openai.com/');

-- Make sure provider_id matches the above inserts (usually 1 for Google, 2 for OpenAI if inserted in that order)
INSERT INTO ai_models (provider_id, model_name, api_identifier, isActive, cost_per_request) VALUES
(1, 'Gemini Pro Vision', 'gemini-pro-vision', TRUE, 1.0), -- Example cost unit
(2, 'DALL-E 3', 'dall-e-3', TRUE, 4.0), -- Example cost unit
(2, 'GPT-4 Turbo Vision', 'gpt-4-turbo-vision', TRUE, 2.0); -- Example cost unit (Note: model names/identifiers may vary)