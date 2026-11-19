import { register } from 'node:module';
import { assertSecurgovRepo } from '../../scripts/securgov.mjs';

assertSecurgovRepo();
register('./securgov-hooks.mjs', import.meta.url);
