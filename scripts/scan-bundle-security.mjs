import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/**
 * Secret patterns that must NEVER appear in the production client web bundle
 * or client-side source code (TASK-28-04, NFR-04).
 */
export const SUSPICIOUS_PATTERNS = [
  {
    id: 'assemblyai_api_key_literal',
    description: 'AssemblyAI API Key environment variable or literal assignment',
    pattern: /ASSEMBLYAI_API_KEY\s*[:=]/i,
  },
  {
    id: 'postgres_connection_uri',
    description: 'PostgreSQL connection string with credentials',
    pattern: /postgres(?:ql)?:\/\/[^/:]+:[^@]+@/i,
  },
  {
    id: 'private_key_header',
    description: 'Cryptographic private key block',
    pattern: /-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----/,
  },
  {
    id: 'generic_api_secret_assignment',
    description: 'Hardcoded secret or private token assignment',
    pattern: /(?:DATABASE_URL|SESSION_SECRET|JWT_SECRET|FASTIFY_SECRET)\s*[:=]\s*["'][^"']+["']/i,
  },
  {
    id: 'live_credential_token_prefix',
    description: 'Known provider secret token prefix',
    pattern: /\b(?:sk_live_[0-9a-zA-Z]{24,}|ghp_[0-9a-zA-Z]{36}|xoxb-[0-9a-zA-Z-]+)\b/,
  },
];

/**
 * Server-only module imports that must never be bundled into apps/web.
 */
export const FORBIDDEN_CLIENT_IMPORTS = [
  'pg',
  'fastify',
  'dotenv',
  '@fastify/cookie',
  '@fastify/cors',
];

/**
 * Recursively find all files in a directory matching extensions.
 */
export async function collectFiles(dirPath, extensions = ['.js', '.css', '.html']) {
  const results = [];
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        const subFiles = await collectFiles(fullPath, extensions);
        results.push(...subFiles);
      } else if (entry.isFile()) {
        if (!extensions || extensions.some((ext) => entry.name.endsWith(ext))) {
          results.push(fullPath);
        }
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  return results;
}

/**
 * Scans built bundle files or client source code for secret leaks and forbidden imports.
 */
export async function scanBundleSecurity({ distDir, srcDir }) {
  const violations = [];
  const scannedFiles = [];

  // 1. Scan production bundle files if distDir is provided
  if (distDir) {
    const files = await collectFiles(distDir, ['.js', '.css', '.html']);
    for (const filePath of files) {
      scannedFiles.push(filePath);
      const content = await readFile(filePath, 'utf8');
      for (const rule of SUSPICIOUS_PATTERNS) {
        if (rule.pattern.test(content)) {
          violations.push({
            type: 'secret_leak_in_bundle',
            file: filePath,
            ruleId: rule.id,
            description: rule.description,
          });
        }
      }
    }
  }

  // 2. Scan client source code for architectural isolation if srcDir is provided
  if (srcDir) {
    const srcFiles = await collectFiles(srcDir, ['.ts', '.tsx', '.js', '.jsx']);
    for (const filePath of srcFiles) {
      scannedFiles.push(filePath);
      const content = await readFile(filePath, 'utf8');

      // Check for forbidden server imports
      for (const mod of FORBIDDEN_CLIENT_IMPORTS) {
        const importRegex = new RegExp(`from\\s+['"]${mod}(?:\\/.*)?['"]|import\\s+['"]${mod}['"]`, 'g');
        if (importRegex.test(content)) {
          violations.push({
            type: 'forbidden_server_import',
            file: filePath,
            module: mod,
            description: `Client source imports server-only package "${mod}"`,
          });
        }
      }

      // Check for raw process.env secret references
      const rawEnvRegex = /process\.env\.(?:ASSEMBLYAI_API_KEY|DATABASE_URL|PGPASSWORD|SESSION_SECRET)/g;
      if (rawEnvRegex.test(content)) {
        violations.push({
          type: 'raw_env_secret_reference',
          file: filePath,
          description: 'Client source accesses server environment variable directly',
        });
      }
    }
  }

  return {
    success: violations.length === 0,
    scannedFileCount: scannedFiles.length,
    violations,
  };
}

// CLI execution check
if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'))) {
  const projectRoot = resolve(import.meta.dirname, '..');
  const distDir = join(projectRoot, 'apps', 'web', 'dist');
  const srcDir = join(projectRoot, 'apps', 'web', 'src');

  console.log('Running web bundle security scan (TASK-28-04)...');
  const result = await scanBundleSecurity({ distDir, srcDir });

  if (!result.success) {
    console.error(`Security scan FAILED with ${result.violations.length} violations:`);
    for (const v of result.violations) {
      console.error(` - [${v.type}] in ${v.file}: ${v.description}`);
    }
    process.exit(1);
  } else {
    console.log(`Security scan PASSED: 0 secrets or leaks detected across ${result.scannedFileCount} files.`);
  }
}
