const sourceMap = require('source-map');
const acorn = require('acorn');

/**
 * @type {{
 *   line: number,
 *   column: number
 * }}
 */
let Location;

/**
 * @type {{
 *   start: !Location,
 *   end: !Location,
 *   offset: undefined|(!Location)
 * }}
 */
let LocationSpan;

/**
 * @type {{
 *   file: (string|undefined),
 *   sourceRoot: (string|undefined),
 *   sources: !Array<string>,
 *   sourcesContent: (!Array<string>|undefined),
 *   names: !Array<string>,
 *   mappings: string
 * }} 
 */
let SourceMap;

/**
 * @param {!string} input 
 * @return {!Array<number>} Array of indexes indicating the index in the original string of start each new line
 */
function getLineIndexes(input) {
  const lineIndexes = [0];
  let currentIndex = 0;
  input.split('\n').forEach((line, index) => {
    lineIndexes[index] = currentIndex;
    currentIndex += line.length + 1;
  });
  return lineIndexes;
}

/**
 * @param {number} index 
 * @param {!Array<number>} lineIndexes
 * @return {number}
 */
function getLineNumForIndex(index, lineIndexes) {
  let lineNum = 0;
  for (let i = 0; i < lineIndexes.length; i++) {
    if (lineIndexes[i] > index) {
      break;
    }
    lineNum = i;
  }
  return lineNum + 1;
}

/**
 * @param {!LocationSpan} a 
 * @param {!LocationSpan} b 
 * @return {number}
 */
function compareLocations(a, b) {
  if (a.start.line !== b.start.line) {
    return a.start.line - b.start.line;
  }
  if (a.start.column !== b.start.column) {
    return a.start.column - b.start.column;
  }
  if (a.end.line !== b.end.line) {
    return a.end.line - b.end.line;
  }
  if (a.end.column !== b.end.column) {
    return a.end.column - b.end.column;
  }
  return a.id - b.id;
}

class StringReplaceSourceMap {
  /**
   * @param {!string} originalString
   * @param {string|SourceMap|null} originalSourceMap
   */
  constructor(originalString, originalSourceMap) {
    this.string = originalString;

    /**
     * Array of indexes indicating the index start of each new line
     * @type {!Array<number>}
     */
    this.lineIndexes = getLineIndexes(originalString);

    if (!originalSourceMap) {
      this.sourceMap = null;
    } else if (typeof originalSourceMap === 'string') {
      this.sourceMap = /** @type {!SourceMap} */ (JSON.parse(originalSourceMap));
    } else {
      this.sourceMap = originalSourceMap;
    }
    this.locationUpdates = [];
    this.nextId = 0;
  }

  /** @param {string} newString */
  append(newString) {
    this.replace(this.string.length, this.string.length, newString);
  }

  /** @param {string} newString */
  prepend(newString) {
    this.replace(0, 0, newString);
  }

  /**
   * @param {number} start 
   * @param {number} end 
   * @param {?string=} newString 
   */
  replace(start, end, newString) {
    const lineIndexesForNewString = getLineIndexes(newString);

    const originalStringStartLine = getLineNumForIndex(start, this.lineIndexes);
    const originalStringEndLine = getLineNumForIndex(end, this.lineIndexes);
    const locationUpdates = {
      start: {
        index: start,
        line: originalStringStartLine,
        column: start - this.lineIndexes[originalStringStartLine - 1]
      },
      end: {
        index: end,
        line: originalStringEndLine,
        column: end - this.lineIndexes[originalStringEndLine - 1]
      },
      newString,
      newStringNumLines: lineIndexesForNewString.length,
      preserveMapping: !(newString === null || newString === undefined || newString.length === 0),
      id: this.nextId
    };
    this.nextId++;

    const lineOffset = (lineIndexesForNewString.length - 1) - (originalStringEndLine - originalStringStartLine);
    const originalStringLastLineLength = locationUpdates.end.column -
        (locationUpdates.start.line === locationUpdates.end.line ? locationUpdates.start.column : 0);
    const newStringLastLineLength = newString.length -
        (lineIndexesForNewString.length > 1 ? lineIndexesForNewString[lineIndexesForNewString.length - 1] : 0);

    locationUpdates.offsetInfo = {
      column: locationUpdates.end.column,
      line: lineOffset
    };

    if (locationUpdates.start.line === locationUpdates.end.line && lineIndexesForNewString.length === 1) {
      locationUpdates.offsetInfo.resetColumn = false;
      locationUpdates.offsetInfo.offset = newStringLastLineLength - originalStringLastLineLength;
    } else if (locationUpdates.start.line !== locationUpdates.end.line && lineIndexesForNewString.length === 1) {
      locationUpdates.offsetInfo.resetColumn = true;
      locationUpdates.offsetInfo.offset = locationUpdates.start.column + newStringLastLineLength - locationUpdates.end.column;
    } else if (locationUpdates.start.line === locationUpdates.end.line && lineIndexesForNewString.length > 1) {
      locationUpdates.offsetInfo.resetColumn = true;
      locationUpdates.offsetInfo.offset = newStringLastLineLength - locationUpdates.end.column;
    } else {
      locationUpdates.offsetInfo.resetColumn = false;
      locationUpdates.offsetInfo.offset = newStringLastLineLength - originalStringLastLineLength;
    }

    this.locationUpdates.push(locationUpdates);
  }

  /** @return {!string} */
  toString() {
    const locationUpdates = this.locationUpdates.slice().sort(compareLocations);
    let updatedString = this.string;
    for (let i = locationUpdates.length - 1; i >= 0; i--) {
      updatedString = updatedString.substr(0, locationUpdates[i].start.index) +
          (locationUpdates[i].newString || '') + 
          updatedString.substr(locationUpdates[i].end.index);
    }
    return updatedString;
  }

  /** @return {!SourceMap} */
  async generateSourceMap() {
    if (!this.sourceMap) {
      throw new Error('An input source map must be provided to generate an output source map.');
    }

    const sourceMapOptions = {};
    if (this.sourceMap.file) {
      sourceMapOptions.file = this.sourceMap.file;
    }
    if (this.sourceMap.sourceRoot) {
      sourceMapOptions.sourceRoot = this.sourceMap.sourceRoot;
    }
    const sourceMapGenerator = new sourceMap.SourceMapGenerator(sourceMapOptions);
    const locationUpdates = this.locationUpdates.slice().sort(compareLocations);
    let locationUpdatesIndex = 0;
    let lineOffset = 0;
    let columnOffsets = {
      line: 0,
      offsets: []
    };
    let currentLocationUpdate = locationUpdates[locationUpdatesIndex];
    let sourcesReferenced = new Set();
    await sourceMap.SourceMapConsumer.with(this.sourceMap, null, async (sourceMapConsumer) => {
      let currentLine = 0;
      sourceMapConsumer.eachMapping((mapping) => {
        let mappingRecord = {
          source: mapping.source,
          generated: {
            line: mapping.generatedLine,
            column: mapping.generatedColumn
          }
        };
        sourcesReferenced.add(mapping.source);
        if (mapping.originalLine !== null && mapping.originalLine !== undefined) {
          mappingRecord.original = {
            line: mapping.originalLine,
            column: mapping.originalColumn
          };
        } else {
          mappingRecord.original = null;
        }
        if (mapping.name !== null && mapping.name !== undefined) {
          mappingRecord.name = mapping.name;
        }

        // Advance the locationUpdate if necessary
        if (currentLocationUpdate) {
          // Find an exact match - may need to remove the mapping if the replacement string is empty
          if (currentLocationUpdate.start.line === mappingRecord.generated.line &&
                currentLocationUpdate.start.column === mappingRecord.generated.column &&
                !currentLocationUpdate.preserveMapping) {
            mappingRecord = null;
          // Check if the next location is still ahead of the current mapping record.
          } else if (currentLocationUpdate.start.line > mappingRecord.generated.line ||
              (currentLocationUpdate.start.line === mappingRecord.generated.line &&
                 currentLocationUpdate.start.column >= mappingRecord.generated.column)) {
            // do nothing
          // Check if the current mapping record is inside the the next replacement. If so, remove the mapping
          } else if (
              (currentLocationUpdate.end.line > mappingRecord.generated.line ||
                (currentLocationUpdate.end.line == mappingRecord.generated.line &&
                  currentLocationUpdate.end.column > mappingRecord.generated.column)) &&
              (currentLocationUpdate.start.line < mappingRecord.generated.line ||
                (currentLocationUpdate.start.line === mappingRecord.generated.line &&
                  currentLocationUpdate.start.column < mappingRecord.generated.column))) {
            mappingRecord = null;
          // Check if the current mapping record is past the replacement. If so, move to the next replacement update.
          } else if (mappingRecord.generated.line > currentLocationUpdate.end.line ||
              (currentLocationUpdate.end.line === mappingRecord.generated.line &&
                  currentLocationUpdate.end.column <= mappingRecord.generated.column)) {
            lineOffset += currentLocationUpdate.offsetInfo.line;
            if (columnOffsets.line === currentLocationUpdate.end.line) {
              columnOffsets.offsets.push(currentLocationUpdate.offsetInfo);
            } else {
              columnOffsets.line = currentLocationUpdate.end.line;
              columnOffsets.offsets = [currentLocationUpdate.offsetInfo];
            }
            locationUpdatesIndex++;
            currentLocationUpdate = locationUpdates[locationUpdatesIndex];
          }
        }

        if (mappingRecord) {
          let columnOffset = 0;
          if (mappingRecord.generated.line === columnOffsets.line) { 
            columnOffset = columnOffsets.offsets.reduce((calculatedOffset, offsetInfo) => {
              if (offsetInfo.resetColumn) {
                return offsetInfo.offset;
              }
              if (mappingRecord.generated.column >= offsetInfo.column) {
                calculatedOffset += offsetInfo.offset;
              }
              return calculatedOffset;
            }, 0);
          }
          if (mappingRecord.generated.line !== currentLine) {
            currentLine = mappingRecord.generated.line;
          }
          mappingRecord.generated.line += lineOffset;
          mappingRecord.generated.column += columnOffset;
          sourceMapGenerator.addMapping(mappingRecord);
        }
      });
    });
    if (this.sourceMap.sourcesContent) {
      this.sourceMap.sources.forEach((sourceFile, index) => {
        if (sourcesReferenced.has(sourceFile) && this.sourceMap.sourcesContent[index]) {
          sourceMapGenerator.setSourceContent(sourceFile, this.sourceMap.sourcesContent[index]);
        }
      });
    }
    return sourceMapGenerator.toJSON();
  }

  /**
   * Helper method to generate an identity source map for a JS file
   * 
   * @param {string} sourcePath of the file
   * @param {string} jsSource
   * @return {!Object}
   */
  static generateJsIdentityMap(sourcePath, jsSource) {
    const generator = new sourceMap.SourceMapGenerator({ file: sourcePath });
    const tokenizer = acorn.tokenizer(jsSource, {
      allowHashBang: true,
      locations: true,
      ecmaVersion: 'latest'
    });
  
    for (let token = tokenizer.getToken(); token.type.label !== 'eof'; token = tokenizer.getToken()) {
      const mapping = {
        original: token.loc.start,
        generated: token.loc.start,
        source: sourcePath,
      };
      if (token.type.label === 'name') {
        mapping.name = token.value;
      }
      generator.addMapping(mapping);
    }
    generator.setSourceContent(sourcePath, jsSource);
    return generator.toJSON();
  }
}

module.exports = StringReplaceSourceMap;
