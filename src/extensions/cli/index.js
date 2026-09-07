#!/usr/bin/env node
/**
 * FLOW Extension CLI
 *
 * Usage:
 *   node src/extensions/cli/index.js <command> [options]
 *
 * Commands:
 *   create   <id> <name> --type connector|workflow|agent|widget
 *   validate <path-to-manifest.json>
 *   build    <extension-dir>
 *   package  <extension-dir> [--out <path>]
 *   install  <manifest-path-or-id>
 *   remove   <extension-id>
 *   upgrade  <manifest-path-or-id>
 *   list
 *   info     <extension-id>
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync }                 from 'node:fs';
import path                           from 'node:path';
import { parseManifest }              from '../manifest/ManifestParser.js';
import { generateConnectorBoilerplate } from '../toolkit/generators/ConnectorBoilerplate.js';
import { generateWorkflowBoilerplate }  from '../toolkit/generators/WorkflowBoilerplate.js';
import { generateAgentBoilerplate }     from '../toolkit/generators/AgentBoilerplate.js';
import { generateWidgetBoilerplate }    from '../toolkit/generators/WidgetBoilerplate.js';

const [,, command, ...rest] = process.argv;

const COMMANDS = {
  create, validate, build, package: packageExt, install, remove, upgrade, list, info,
};

async function main() {
  const handler = COMMANDS[command];
  if (!handler) {
    console.error(`Unknown command: "${command}"\nAvailable: ${Object.keys(COMMANDS).join(', ')}`);
    process.exit(1);
  }
  try {
    await handler(rest);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

async function create([id, name, ...flags]) {
  if (!id || !name) throw new Error('Usage: create <id> <name> --type connector|workflow|agent|widget');

  const typeFlag = flags.indexOf('--type');
  const type     = typeFlag >= 0 ? flags[typeFlag + 1] : 'workflow';
  const outDir   = path.resolve(process.cwd(), 'extensions', id);

  const generators = {
    connector: () => generateConnectorBoilerplate({ id, name, connectorId: id }),
    workflow:  () => generateWorkflowBoilerplate({ id, name }),
    agent:     () => generateAgentBoilerplate({ id, name }),
    widget:    () => generateWidgetBoilerplate({ id, name }),
  };

  const gen = generators[type];
  if (!gen) throw new Error(`Unknown type "${type}". Must be: connector, workflow, agent, widget`);

  const { manifest, files } = gen();

  await mkdir(outDir, { recursive: true });
  for (const [filename, content] of Object.entries(files)) {
    const dest = path.join(outDir, filename);
    if (existsSync(dest)) {
      console.warn(`  skip (exists): ${filename}`);
      continue;
    }
    await writeFile(dest, content, 'utf8');
    console.log(`  created: ${filename}`);
  }
  console.log(`\nExtension scaffolded at: ${outDir}`);
  console.log(`Next: edit main.js, then run: flow-ext validate ${outDir}/manifest.json`);
}

async function validate([manifestPath]) {
  if (!manifestPath) throw new Error('Usage: validate <path-to-manifest.json>');
  const raw  = JSON.parse(await readFile(path.resolve(manifestPath), 'utf8'));
  const { manifest, errors } = parseManifest(raw);
  if (errors.length) {
    console.error('Validation FAILED:');
    errors.forEach(e => console.error(`  ✗ ${e}`));
    process.exit(1);
  }
  console.log(`✓ Manifest valid: ${manifest.id}@${manifest.version}`);
  console.log(`  category: ${manifest.category}`);
  console.log(`  permissions: ${manifest.permissions.join(', ')}`);
}

async function build([extDir]) {
  if (!extDir) throw new Error('Usage: build <extension-dir>');
  const manifestPath = path.join(path.resolve(extDir), 'manifest.json');
  if (!existsSync(manifestPath)) throw new Error(`manifest.json not found in ${extDir}`);
  await validate([manifestPath]);
  console.log(`\nBuild OK — use "package" to create a distributable bundle.`);
}

async function packageExt([extDir, ...flags]) {
  if (!extDir) throw new Error('Usage: package <extension-dir> [--out <path>]');
  const outFlag = flags.indexOf('--out');
  const absDir  = path.resolve(extDir);
  const manifest = JSON.parse(await readFile(path.join(absDir, 'manifest.json'), 'utf8'));
  const outFile  = outFlag >= 0
    ? path.resolve(flags[outFlag + 1])
    : path.resolve(process.cwd(), `${manifest.id}@${manifest.version}.flow-ext.json`);

  // Bundle = manifest + source files serialized as a JSON package
  const files   = {};
  for (const [key, relPath] of Object.entries(manifest.entrypoints || {})) {
    const src = path.join(absDir, relPath);
    if (existsSync(src)) files[relPath] = await readFile(src, 'utf8');
  }

  const bundle = { schemaVersion: '1.0', manifest, files };
  await writeFile(outFile, JSON.stringify(bundle, null, 2), 'utf8');
  console.log(`Packaged: ${outFile}`);
}

async function install([source]) {
  if (!source) throw new Error('Usage: install <manifest-path>');
  console.log(`install: call POST /api/extensions/install with the package file`);
  console.log(`  (CLI install delegates to the running FLOW server)`);
  console.log(`  curl -X POST http://localhost:5001/api/extensions/install \\`);
  console.log(`       -H "Authorization: Bearer <jwt>" \\`);
  console.log(`       -d @${source}`);
}

async function remove([extensionId]) {
  if (!extensionId) throw new Error('Usage: remove <extension-id>');
  console.log(`remove: call DELETE /api/extensions/${extensionId}`);
}

async function upgrade([source]) {
  if (!source) throw new Error('Usage: upgrade <manifest-path>');
  console.log(`upgrade: call PUT /api/extensions/upgrade with the package file`);
}

async function list() {
  console.log(`list: call GET /api/extensions`);
  console.log(`  curl http://localhost:5001/api/extensions -H "Authorization: Bearer <jwt>"`);
}

async function info([extensionId]) {
  if (!extensionId) throw new Error('Usage: info <extension-id>');
  console.log(`info: call GET /api/extensions/${extensionId}`);
}

main();
