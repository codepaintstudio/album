import { VISIBILITIES } from '@/lib/access-rules';
import { z } from 'zod';

export const visibilitySchema = z.enum(VISIBILITIES);
