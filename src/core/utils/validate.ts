import Joi from 'joi';
import { ValidationError } from './errors';

export const validateSchema = <T>(schema: Joi.Schema, data: unknown): T => {
  const { error, value } = schema.validate(data, { abortEarly: false });

  if (error) {
    const details = error.details.map(d => ({
      field: d.path.join('.'),
      message: d.message
    }));
    throw new ValidationError('Validation failed', details);
  }

  return value as T;
};

export const userSchema = Joi.object({
  id: Joi.string().required(),
  discordId: Joi.string().required(),
  username: Joi.string().required(),
  email: Joi.string().email().optional(),
  balance: Joi.number().min(0).default(0),
  createdAt: Joi.date().default(() => new Date()),
  updatedAt: Joi.date().default(() => new Date())
});

export const transactionSchema = Joi.object({
  id: Joi.string().required(),
  orderId: Joi.string().required(),
  userId: Joi.string().required(),
  productId: Joi.string().required(),
  amount: Joi.number().min(0).required(),
  currency: Joi.string().default('IDR'),
  status: Joi.string()
    .valid('pending', 'processing', 'completed', 'failed', 'cancelled')
    .default('pending'),
  paymentMethod: Joi.string().optional(),
  paymentLink: Joi.string().optional(),
  metadata: Joi.object().optional(),
  createdAt: Joi.date().default(() => new Date()),
  updatedAt: Joi.date().default(() => new Date()),
  completedAt: Joi.date().optional()
});

export const createTransactionSchema = Joi.object({
  userId: Joi.string().required(),
  productId: Joi.string().required(),
  amount: Joi.number().min(0).required(),
  currency: Joi.string().default('IDR'),
  metadata: Joi.object().optional()
});

export const updateTransactionSchema = Joi.object({
  status: Joi.string()
    .valid('pending', 'processing', 'completed', 'failed', 'cancelled')
    .optional(),
  paymentMethod: Joi.string().optional(),
  paymentLink: Joi.string().optional(),
  metadata: Joi.object().optional(),
  completedAt: Joi.date().optional()
});

export const productSchema = Joi.object({
  id: Joi.string().required(),
  name: Joi.string().required(),
  description: Joi.string().required(),
  price: Joi.number().min(0).required(),
  currency: Joi.string().default('IDR'),
  type: Joi.string().required(),
  metadata: Joi.object().optional()
});

export function validateId(id: string, fieldName: string = 'id'): void {
  if (!id || typeof id !== 'string' || id.trim().length === 0) {
    throw new ValidationError(`Invalid ${fieldName}: must be a non-empty string`);
  }
}

export function validateAmount(amount: number): void {
  if (typeof amount !== 'number' || amount < 0 || !isFinite(amount)) {
    throw new ValidationError('Invalid amount: must be a positive number');
  }
}

export function validateStatus(status: string): void {
  const validStatuses = ['pending', 'processing', 'completed', 'failed', 'cancelled'];
  if (!validStatuses.includes(status)) {
    throw new ValidationError(
      `Invalid status: must be one of ${validStatuses.join(', ')}`
    );
  }
}
