import { readConfig } from './config';
import { DemoRepository } from './demoRepository';
import { SupabaseRepository } from './supabaseRepository';
import { createSupabaseClient } from './supabaseClient';
import type { Repository } from './repository';

let instance: Repository | null = null;

export function getRepository(): Repository {
  if (instance) return instance;
  const config = readConfig();
  instance = config.hasSupabase
    ? new SupabaseRepository(createSupabaseClient(config))
    : new DemoRepository();
  return instance;
}

export { RepositoryError } from './repository';
export type { Repository } from './repository';
