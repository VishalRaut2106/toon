import process from 'node:process'
import { consola } from 'consola'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_DELIMITER, encode } from '../../toon/src'
import { version } from '../package.json' with { type: 'json' }
import { createCliTestContext, mockStdin, runCli } from './utils'

describe('toon CLI', () => {
  beforeEach(() => {
    vi.spyOn(process, 'exit').mockImplementation(() => 0 as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('version', () => {
    it('prints the version when using --version', async () => {
      const consolaLog = vi.spyOn(consola, 'log').mockImplementation(() => undefined)

      await runCli({ rawArgs: ['--version'] })

      expect(consolaLog).toHaveBeenCalledWith(version)
    })
  })

  describe('encode (JSON → TOON)', () => {
    it('encodes JSON from stdin', async () => {
      const data = {
        title: 'TOON test',
        count: 3,
        nested: { ok: true },
      }
      const cleanup = mockStdin(JSON.stringify(data))

      const writeChunks: string[] = []
      vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
        writeChunks.push(String(chunk))
        return true
      })

      try {
        await runCli()
        const fullOutput = writeChunks.join('')
        expect(fullOutput).toBe(`${encode(data)}\n`)
      }
      finally {
        cleanup()
      }
    })

    it('encodes a JSON file into a TOON file', async () => {
      const data = {
        title: 'TOON test',
        count: 3,
        nested: { ok: true },
      }
      const context = await createCliTestContext({
        'input.json': JSON.stringify(data, undefined, 2),
      })

      const consolaSuccess = vi.spyOn(consola, 'success').mockImplementation(() => undefined)

      try {
        await context.run(['input.json', '--output', 'output.toon'])

        const output = await context.read('output.toon')
        const expected = encode(data, {
          delimiter: DEFAULT_DELIMITER,
          indent: 2,
        })

        expect(output).toBe(expected)
        expect(consolaSuccess).toHaveBeenCalledWith(expect.stringMatching(/Encoded .* → .*/))
      }
      finally {
        await context.cleanup()
      }
    })

    it('writes to stdout when output not specified', async () => {
      const data = { ok: true }
      const context = await createCliTestContext({
        'input.json': JSON.stringify(data),
      })

      const writeChunks: string[] = []
      vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
        writeChunks.push(String(chunk))
        return true
      })

      try {
        await context.run(['input.json'])

        const fullOutput = writeChunks.join('')
        expect(fullOutput).toBe(`${encode(data)}\n`)
      }
      finally {
        await context.cleanup()
      }
    })

    it('encodes JSON from stdin to output file', async () => {
      const data = { key: 'value' }
      const context = await createCliTestContext({})
      const cleanup = mockStdin(JSON.stringify(data))

      const consolaSuccess = vi.spyOn(consola, 'success').mockImplementation(() => undefined)

      try {
        await context.run(['--output', 'output.toon'])

        const output = await context.read('output.toon')
        expect(output).toBe(encode(data))
        expect(consolaSuccess).toHaveBeenCalledWith(expect.stringMatching(/Encoded.*stdin[^\n\r\u2028\u2029\u2192]*\u2192.*output\.toon/))
      }
      finally {
        cleanup()
        await context.cleanup()
      }
    })
  })

  describe('decode (TOON → JSON)', () => {
    it('decodes a TOON file into a JSON file', async () => {
      const data = {
        items: ['alpha', 'beta'],
        meta: { done: false },
      }
      const toonInput = encode(data)
      const context = await createCliTestContext({
        'input.toon': toonInput,
      })

      const consolaSuccess = vi.spyOn(consola, 'success').mockImplementation(() => undefined)

      try {
        await context.run(['input.toon', '--output', 'output.json'])

        const output = await context.read('output.json')
        expect(JSON.parse(output)).toEqual(data)
        expect(consolaSuccess).toHaveBeenCalledWith(expect.stringMatching(/Decoded .* → .*/))
      }
      finally {
        await context.cleanup()
      }
    })

    it('decodes TOON from stdin', async () => {
      const data = { items: ['a', 'b'], count: 2 }
      const toonInput = encode(data)

      const cleanup = mockStdin(toonInput)

      const stdout: string[] = []
      vi.spyOn(console, 'log').mockImplementation((message?: unknown) => {
        stdout.push(String(message ?? ''))
      })

      try {
        await runCli({ rawArgs: ['--decode'] })
        expect(stdout).toHaveLength(1)
        const result = JSON.parse(stdout?.at(0) ?? '')
        expect(result).toEqual(data)
      }
      finally {
        cleanup()
      }
    })

    it('decodes TOON from stdin to output file', async () => {
      const data = { name: 'test', values: [1, 2, 3] }
      const toonInput = encode(data)
      const context = await createCliTestContext({})
      const cleanup = mockStdin(toonInput)

      const consolaSuccess = vi.spyOn(consola, 'success').mockImplementation(() => undefined)

      try {
        await context.run(['--decode', '--output', 'output.json'])

        const output = await context.read('output.json')
        expect(JSON.parse(output)).toEqual(data)
        expect(consolaSuccess).toHaveBeenCalledWith(expect.stringMatching(/Decoded.*stdin[^\n\r\u2028\u2029\u2192]*\u2192.*output\.json/))
      }
      finally {
        cleanup()
        await context.cleanup()
      }
    })
  })

  describe('stdin edge cases', () => {
    it('handles invalid JSON from stdin', async () => {
      const cleanup = mockStdin('{ invalid json }')

      const consolaError = vi.spyOn(consola, 'error').mockImplementation(() => undefined)
      const exitSpy = vi.mocked(process.exit)

      try {
        await runCli({ rawArgs: [] })

        expect(exitSpy).toHaveBeenCalledWith(1)
        expect(consolaError).toHaveBeenCalled()
      }
      finally {
        cleanup()
      }
    })

    it('handles invalid TOON from stdin', async () => {
      const cleanup = mockStdin('key: "unterminated string')

      const consolaError = vi.spyOn(consola, 'error').mockImplementation(() => undefined)
      const exitSpy = vi.mocked(process.exit)

      try {
        await runCli({ rawArgs: ['--decode'] })

        expect(exitSpy).toHaveBeenCalledWith(1)
        expect(consolaError).toHaveBeenCalled()
      }
      finally {
        cleanup()
      }
    })
  })

  describe('stdin with options', () => {
    it('encodes JSON from stdin with custom delimiter', async () => {
      const data = { items: [1, 2, 3] }
      const cleanup = mockStdin(JSON.stringify(data))

      const writeChunks: string[] = []
      vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
        writeChunks.push(String(chunk))
        return true
      })

      try {
        await runCli({ rawArgs: ['--delimiter', '|'] })

        const fullOutput = writeChunks.join('')
        expect(fullOutput).toBe(`${encode(data, { delimiter: '|' })}\n`)
      }
      finally {
        cleanup()
      }
    })

    it('encodes JSON from stdin with custom indent', async () => {
      const data = {
        nested: {
          deep: { value: 1 },
        },
      }
      const cleanup = mockStdin(JSON.stringify(data))

      const writeChunks: string[] = []
      vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
        writeChunks.push(String(chunk))
        return true
      })

      try {
        await runCli({ rawArgs: ['--indent', '4'] })

        const fullOutput = writeChunks.join('')
        expect(fullOutput).toBe(`${encode(data, { indent: 4 })}\n`)
      }
      finally {
        cleanup()
      }
    })

    it('decodes TOON from stdin with --no-strict', async () => {
      const data = { test: true }
      const toonInput = encode(data)
      const cleanup = mockStdin(toonInput)

      const stdout: string[] = []
      vi.spyOn(console, 'log').mockImplementation((message?: unknown) => {
        stdout.push(String(message ?? ''))
      })

      try {
        await runCli({ rawArgs: ['--decode', '--no-strict'] })

        expect(stdout).toHaveLength(1)
        const result = JSON.parse(stdout?.at(0) ?? '')
        expect(result).toEqual(data)
      }
      finally {
        cleanup()
      }
    })
  })

  describe('streaming output', () => {
    it('streams large JSON to TOON file with identical output', async () => {
      const data = {
        items: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          name: `Item ${i}`,
          value: Math.random(),
        })),
      }

      const context = await createCliTestContext({
        'large-input.json': JSON.stringify(data, undefined, 2),
      })

      const consolaSuccess = vi.spyOn(consola, 'success').mockImplementation(() => undefined)

      try {
        await context.run(['large-input.json', '--output', 'output.toon'])

        const output = await context.read('output.toon')
        // Verify streaming produces identical output to `encode()`
        const expected = encode(data, {
          delimiter: DEFAULT_DELIMITER,
          indent: 2,
        })

        expect(output).toBe(expected)
        expect(consolaSuccess).toHaveBeenCalledWith(expect.stringMatching(/Encoded .* → .*/))
      }
      finally {
        await context.cleanup()
      }
    })

    it('streams to stdout using process.stdout.write', async () => {
      const data = {
        users: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ],
      }

      const context = await createCliTestContext({
        'input.json': JSON.stringify(data),
      })

      const writeChunks: string[] = []
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
        writeChunks.push(String(chunk))
        return true
      })

      try {
        await context.run(['input.json'])

        expect(writeSpy).toHaveBeenCalled()

        // Verify complete output matches `encode()`
        const fullOutput = writeChunks.join('')
        const expected = `${encode(data)}\n`
        expect(fullOutput).toBe(expected)
      }
      finally {
        await context.cleanup()
      }
    })

    it('handles empty object streaming correctly', async () => {
      const data = {}

      const context = await createCliTestContext({
        'empty.json': JSON.stringify(data),
      })

      try {
        await context.run(['empty.json', '--output', 'output.toon'])

        const output = await context.read('output.toon')
        expect(output).toBe(encode(data))
      }
      finally {
        await context.cleanup()
      }
    })

    it('handles single-line output streaming correctly', async () => {
      const data = { key: 'value' }

      const context = await createCliTestContext({
        'single.json': JSON.stringify(data),
      })

      try {
        await context.run(['single.json', '--output', 'output.toon'])

        const output = await context.read('output.toon')
        expect(output).toBe(encode(data))
      }
      finally {
        await context.cleanup()
      }
    })

    it('uses non-streaming path when stats are enabled', async () => {
      const data = {
        items: [
          { id: 1, value: 'test' },
          { id: 2, value: 'data' },
        ],
      }

      const context = await createCliTestContext({
        'input.json': JSON.stringify(data),
      })

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
      const consolaInfo = vi.spyOn(consola, 'info').mockImplementation(() => undefined)
      const consolaSuccess = vi.spyOn(consola, 'success').mockImplementation(() => undefined)

      try {
        await context.run(['input.json', '--stats'])

        expect(consolaInfo).toHaveBeenCalledWith(expect.stringMatching(/Token estimates:/))
        expect(consolaSuccess).toHaveBeenCalledWith(expect.stringMatching(/Saved.*tokens/))
        expect(consoleLogSpy).toHaveBeenCalledWith(encode(data))
      }
      finally {
        await context.cleanup()
      }
    })
  })

  describe('error handling', () => {
    it('rejects invalid delimiter', async () => {
      const context = await createCliTestContext({
        'input.json': JSON.stringify({ value: 1 }),
      })

      const consolaError = vi.spyOn(consola, 'error').mockImplementation(() => undefined)
      const exitSpy = vi.mocked(process.exit)

      try {
        await context.run(['input.json', '--delimiter', ';'])

        expect(exitSpy).toHaveBeenCalledWith(1)

        const errorCall = consolaError.mock.calls.at(0)
        expect(errorCall).toBeDefined()
        const [error] = errorCall!
        expect(error).toBeInstanceOf(Error)
        expect(error.message).toContain('Invalid delimiter')
      }
      finally {
        await context.cleanup()
      }
    })

    it('rejects invalid indent value', async () => {
      const context = await createCliTestContext({
        'input.json': JSON.stringify({ value: 1 }),
      })

      const consolaError = vi.spyOn(consola, 'error').mockImplementation(() => undefined)
      const exitSpy = vi.mocked(process.exit)

      try {
        await context.run(['input.json', '--indent', 'abc'])

        expect(exitSpy).toHaveBeenCalledWith(1)

        const errorCall = consolaError.mock.calls.at(0)
        expect(errorCall).toBeDefined()
        const [error] = errorCall!
        expect(error).toBeInstanceOf(Error)
        expect(error.message).toContain('Invalid indent value')
      }
      finally {
        await context.cleanup()
      }
    })

    it('handles missing input file', async () => {
      const context = await createCliTestContext({})

      const consolaError = vi.spyOn(consola, 'error').mockImplementation(() => undefined)
      const exitSpy = vi.mocked(process.exit)

      try {
        await context.run(['nonexistent.json'])

        expect(exitSpy).toHaveBeenCalledWith(1)
        expect(consolaError).toHaveBeenCalled()
      }
      finally {
        await context.cleanup()
      }
    })
  })
})
