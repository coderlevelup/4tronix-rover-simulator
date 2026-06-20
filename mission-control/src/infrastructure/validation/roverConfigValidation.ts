import { z } from 'zod';

const ipAddressSchema = z
  .string()
  .refine(
    (val) => {
      // Allow IPv4, 'localhost', or domain names like 'marspi.local'
      const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
      const hostnameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/;
      return val === 'localhost' || ipv4Regex.test(val) || hostnameRegex.test(val);
    },
    { message: 'Must be a valid IPv4 address, localhost, or hostname' }
  )
  .describe('Valid IPv4 address, localhost, or hostname');

const portSchema = z
  .number()
  .int()
  .min(1)
  .max(65535)
  .describe('Valid port number');

export const createRoverConfigSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  roverTag: z.string().min(1).max(50),

  // Rover type
  roverType: z.enum(['physical', 'simulator']),

  // Connection info
  ipAddress: ipAddressSchema,
  port: portSchema,

  // Visual feed
  visualFeedType: z.enum(['camera', 'simulator']),
  cameraWsPort: z.number().int().min(1).max(65535).optional(),
  simulatorEndpoint: z.string().url().optional(),
});

export const updateRoverConfigSchema = createRoverConfigSchema.partial();

export const setActiveConfigSchema = z.object({
  configId: z.string().min(1),
});
