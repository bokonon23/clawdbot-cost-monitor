const assert = require('assert');
const path = require('path');

// Import the functions we want to test by extracting them from cost-calculator
// Since they aren't exported, we'll replicate them here for isolated testing
// and also verify the module exports work correctly.

// --- resolveBaseSafe ---

function resolveBaseSafe(baseDir, childName) {
  if (path.isAbsolute(childName) || childName.includes('\0')) {
    throw new Error('Unsafe path segment');
  }
  const baseResolved = path.resolve(baseDir);
  const candidate = path.resolve(baseResolved, childName);
  if (!(candidate === baseResolved || candidate.startsWith(baseResolved + path.sep))) {
    throw new Error('Path traversal attempt blocked');
  }
  return candidate;
}

function isPathInAllowedRoots(targetPath, roots) {
  const targetResolved = path.resolve(targetPath);
  return roots.some((root) => {
    const rootResolved = path.resolve(root);
    return targetResolved === rootResolved || targetResolved.startsWith(rootResolved + path.sep);
  });
}

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS: ${name}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL: ${name}`);
    console.error(`        ${err.message}`);
  }
}

console.log('\n=== resolveBaseSafe tests ===\n');

test('allows simple child name', () => {
  const result = resolveBaseSafe('/tmp/base', 'file.jsonl');
  assert.strictEqual(result, path.resolve('/tmp/base', 'file.jsonl'));
});

test('allows nested child path', () => {
  const result = resolveBaseSafe('/tmp/base', 'sub/file.jsonl');
  assert.strictEqual(result, path.resolve('/tmp/base/sub', 'file.jsonl'));
});

test('blocks path traversal with ../', () => {
  assert.throws(() => resolveBaseSafe('/tmp/base', '../etc/passwd'), /Path traversal/);
});

test('blocks path traversal with nested ../', () => {
  assert.throws(() => resolveBaseSafe('/tmp/base', 'sub/../../etc/passwd'), /Path traversal/);
});

test('blocks absolute paths', () => {
  assert.throws(() => resolveBaseSafe('/tmp/base', '/etc/passwd'), /Unsafe path segment/);
});

test('blocks null-byte injection', () => {
  assert.throws(() => resolveBaseSafe('/tmp/base', 'file\0.jsonl'), /Unsafe path segment/);
});

test('allows base directory itself', () => {
  const result = resolveBaseSafe('/tmp/base', '.');
  assert.strictEqual(result, path.resolve('/tmp/base'));
});

console.log('\n=== isPathInAllowedRoots tests ===\n');

test('allows path within an allowed root', () => {
  const roots = ['/home/user/.openclaw/agents/main/sessions'];
  assert.strictEqual(isPathInAllowedRoots('/home/user/.openclaw/agents/main/sessions/abc.jsonl', roots), true);
});

test('allows exact root path', () => {
  const roots = ['/home/user/.openclaw/agents/main/sessions'];
  assert.strictEqual(isPathInAllowedRoots('/home/user/.openclaw/agents/main/sessions', roots), true);
});

test('blocks path outside all roots', () => {
  const roots = ['/home/user/.openclaw/agents/main/sessions'];
  assert.strictEqual(isPathInAllowedRoots('/etc/passwd', roots), false);
});

test('blocks path that is a prefix but not a child (no path separator)', () => {
  const roots = ['/home/user/.openclaw'];
  // /home/user/.openclawEVIL is a prefix match but not a child directory
  assert.strictEqual(isPathInAllowedRoots('/home/user/.openclawEVIL/file', roots), false);
});

test('works with multiple roots', () => {
  const roots = ['/home/user/.openclaw/sessions', '/home/user/.claude/projects'];
  assert.strictEqual(isPathInAllowedRoots('/home/user/.claude/projects/foo/bar.jsonl', roots), true);
  assert.strictEqual(isPathInAllowedRoots('/home/user/.other/file', roots), false);
});

console.log('\n=== cost-calculator module exports ===\n');

test('cost-calculator exports expected functions', () => {
  const cc = require('./cost-calculator');
  assert.strictEqual(typeof cc.analyzeUsage, 'function');
  assert.strictEqual(typeof cc.calculateCost, 'function');
  assert.strictEqual(typeof cc.findJsonlFiles, 'function');
  assert.strictEqual(typeof cc.parseJsonlFile, 'function');
  assert.ok(cc.MODEL_PRICING);
});

test('calculateCost returns correct structure', () => {
  const cc = require('./cost-calculator');
  const result = cc.calculateCost(
    { input: 1000000, output: 500000, cacheWrite: 0, cacheRead: 0 },
    'claude-sonnet-4-5-20251101'
  );
  assert.ok(result.total > 0);
  assert.ok(result.breakdown);
  assert.strictEqual(result.breakdown.input, 3.00); // 1M tokens * $3/M
  assert.strictEqual(result.breakdown.output, 7.50); // 0.5M tokens * $15/M
});

test('calculateCost uses default pricing for unknown model', () => {
  const cc = require('./cost-calculator');
  const result = cc.calculateCost(
    { input: 1000000, output: 0, cacheWrite: 0, cacheRead: 0 },
    'totally-unknown-model'
  );
  assert.strictEqual(result.breakdown.input, 3.00); // Default pricing matches Sonnet
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
