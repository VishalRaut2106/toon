import type { FileHandle } from 'node:fs/promises'
import type { DecodeOptions, EncodeOptions } from '../../toon/src'
import type { InputSource } from './types'
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import process from 'node:process'
import { consola } from 'consola'
import { estimateTokenCount } from 'tokenx'
import { decode, encode, encodeLines } from '../../toon/src'
import { formatInputLabel, readInput } from './utils'

export async function encodeToToon(config: {
  input: InputSource
  output?: string
  indent: NonNullable<EncodeOptions['indent']>
  delimiter: NonNullable<EncodeOptions['delimiter']>
  keyFolding?: NonNullable<EncodeOptions['keyFolding']>
  flattenDepth?: number
  printStats: boolean
}): Promise<void> {
  const jsonContent = await readInput(config.input)

  let data: unknown
  try {
    data = JSON.parse(jsonContent)
  }
  catch (error) {
    throw new Error(`Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`)
  }

  const encodeOptions: EncodeOptions = {
    delimiter: config.delimiter,
    indent: config.indent,
    keyFolding: config.keyFolding,
    flattenDepth: config.flattenDepth,
  }

  // When printing stats, we need the full string for token counting
  if (config.printStats) {
    const toonOutput = encode(data, encodeOptions)

    if (config.output) {
      await fsp.writeFile(config.output, toonOutput, 'utf-8')
    }
    else {
      console.log(toonOutput)
    }

    const jsonTokens = estimateTokenCount(jsonContent)
    const toonTokens = estimateTokenCount(toonOutput)
    const diff = jsonTokens - toonTokens
    const percent = ((diff / jsonTokens) * 100).toFixed(1)

    if (config.output) {
      const relativeInputPath = formatInputLabel(config.input)
      const relativeOutputPath = path.relative(process.cwd(), config.output)
      consola.success(`Encoded \`${relativeInputPath}\` → \`${relativeOutputPath}\``)
    }

    console.log()
    consola.info(`Token estimates: ~${jsonTokens} (JSON) → ~${toonTokens} (TOON)`)
    consola.success(`Saved ~${diff} tokens (-${percent}%)`)
  }
  else {
    // Use streaming encoder for memory-efficient output
    await writeStreamingToon(encodeLines(data, encodeOptions), config.output)

    if (config.output) {
      const relativeInputPath = formatInputLabel(config.input)
      const relativeOutputPath = path.relative(process.cwd(), config.output)
      consola.success(`Encoded \`${relativeInputPath}\` → \`${relativeOutputPath}\``)
    }
  }
}

export async function decodeToJson(config: {
  input: InputSource
  output?: string
  indent: NonNullable<DecodeOptions['indent']>
  strict: NonNullable<DecodeOptions['strict']>
  expandPaths?: NonNullable<DecodeOptions['expandPaths']>
}): Promise<void> {
  const toonContent = await readInput(config.input)

  let data: unknown
  try {
    const decodeOptions: DecodeOptions = {
      indent: config.indent,
      strict: config.strict,
      expandPaths: config.expandPaths,
    }
    data = decode(toonContent, decodeOptions)
  }
  catch (error) {
    throw new Error(`Failed to decode TOON: ${error instanceof Error ? error.message : String(error)}`)
  }

  const jsonOutput = JSON.stringify(data, undefined, config.indent)

  if (config.output) {
    await fsp.writeFile(config.output, jsonOutput, 'utf-8')
    const relativeInputPath = formatInputLabel(config.input)
    const relativeOutputPath = path.relative(process.cwd(), config.output)
    consola.success(`Decoded \`${relativeInputPath}\` → \`${relativeOutputPath}\``)
  }
  else {
    console.log(jsonOutput)
  }
}

/**
 * Writes TOON lines to a file or stdout using streaming approach.
 * Lines are written one at a time without building the full string in memory.
 *
 * @param lines - Iterable of TOON lines (without trailing newlines)
 * @param outputPath - File path to write to, or undefined for stdout
 */
async function writeStreamingToon(
  lines: Iterable<string>,
  outputPath?: string,
): Promise<void> {
  let isFirst = true

  // Stream to file using fs/promises API
  if (outputPath) {
    let fileHandle: FileHandle | undefined

    try {
      fileHandle = await fsp.open(outputPath, 'w')

      for (const line of lines) {
        if (!isFirst)
          await fileHandle.write('\n')

        await fileHandle.write(line)
        isFirst = false
      }
    }
    finally {
      await fileHandle?.close()
    }
  }
  // Stream to stdout
  else {
    for (const line of lines) {
      if (!isFirst)
        process.stdout.write('\n')

      process.stdout.write(line)
      isFirst = false
    }

    // Add final newline for stdout
    process.stdout.write('\n')
  }
}
