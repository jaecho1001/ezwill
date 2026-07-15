#!/usr/bin/env node

// Export the trusted TypeScript clause data as JSON for the private database
// seeder. No licensed source material is included here: this is the firm's
// existing authored template library and its document defaults.

import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const root = path.resolve(import.meta.dirname, '..')

function loadTypeScriptModule(relativePath) {
  const filename = path.join(root, relativePath)
  const source = fs.readFileSync(filename, 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText
  const module = { exports: {} }
  const localRequire = (specifier) => {
    if (specifier === './clause-library') return loadTypeScriptModule('src/lib/will-documents/clause-library.ts')
    throw new Error(`Unsupported runtime import in clause export: ${specifier}`)
  }
  new Function('exports', 'module', 'require', compiled)(module.exports, module, localRequire)
  return module.exports
}

const clauseModule = loadTypeScriptModule('src/lib/will-documents/clause-library.ts')
const indexModule = loadTypeScriptModule('src/lib/will-documents/index.ts')

process.stdout.write(JSON.stringify({
  clauses: clauseModule.willClauseLibrary,
  documentTypes: indexModule.willDocumentTypes,
}, null, 2))
