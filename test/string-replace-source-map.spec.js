const fs = require('fs');
const path = require('path');
const sourceMap = require('source-map');

function verifySourceMap(originalContents, newContents, generatedSourceMap, replacementIndex) {
  const originalLines = originalContents.split('\n');
  const newLines = newContents.split('\n');
  let replacementLineColumn;
  let currentCharTotal = 0;
  for (let i = 0; i < originalLines.length; i++) {
    if (currentCharTotal + originalLines[i].length >= replacementIndex) {
      replacementLineColumn = {
        line: i + 1,
        column: replacementIndex - currentCharTotal
      };
      break;
    }
    currentCharTotal += originalLines[i].length + 1;
  }
  return sourceMap.SourceMapConsumer.with(generatedSourceMap, null, async (sourceMapConsumer) => {
    sourceMapConsumer.eachMapping((mapping) => {
      expect(originalLines[mapping.originalLine - 1]).toBeDefined();
      expect(newLines[mapping.generatedLine - 1]).toBeDefined();
      if (mapping.originalLine !== replacementLineColumn.line || mapping.originalColumn !== replacementLineColumn.column) {
        expect(originalLines[mapping.originalLine - 1].substr(mapping.originalColumn, 1))
          .toEqual(newLines[mapping.generatedLine - 1].substr(mapping.generatedColumn, 1));
      }
    });
  });
}

describe('string-replace-source-map', () => {
  const StringReplaceSourceMap = require('../');
  const originalFile = fs.readFileSync(path.resolve(__dirname, 'fixtures/original-file.js'), 'utf8');
  const originalSourceMap = fs.readFileSync(path.resolve(__dirname, 'fixtures/original-file.js.map'), 'utf8');
  /** @type {!StringReplaceSourceMap} */
  let stringReplaceSourceMap;

  beforeEach(() => {
    stringReplaceSourceMap = new StringReplaceSourceMap(originalFile, originalSourceMap);
  });

  it('should replace a single line string with a shorter single line string', async () => {
    const substr = "'original string 1'";
    const substrIndex = originalFile.indexOf(substr);
    const replacementString = "'foobar'";
    stringReplaceSourceMap.replace(substrIndex, substrIndex + substr.length, replacementString);
    expect(stringReplaceSourceMap.toString().substring(substrIndex, substrIndex + replacementString.length))
        .toEqual(replacementString);

    await verifySourceMap(
        originalFile, stringReplaceSourceMap.toString(), await stringReplaceSourceMap.generateSourceMap(), substrIndex);
  });

  it('should replace a single line string with alonger single line string', async () => {
    const substr = "'original string 2'";
    const substrIndex = originalFile.indexOf(substr);
    const replacementString = "'a longer string - significantly longer'";
    stringReplaceSourceMap.replace(substrIndex, substrIndex + substr.length, replacementString);
    expect(stringReplaceSourceMap.toString().substring(substrIndex, substrIndex + replacementString.length))
        .toEqual(replacementString);

    await verifySourceMap(
        originalFile, stringReplaceSourceMap.toString(), await stringReplaceSourceMap.generateSourceMap(), substrIndex);
  });

  it('should replace a single line string with a multi-line string', async () => {
    const substr = "'original string 3'";
    const substrIndex = originalFile.indexOf(substr);
    const replacementString = `\`a
multi
line
string\``;
    stringReplaceSourceMap.replace(substrIndex, substrIndex + substr.length, replacementString);
    expect(stringReplaceSourceMap.toString().substring(substrIndex, substrIndex + replacementString.length))
        .toEqual(replacementString);

    await verifySourceMap(
        originalFile, stringReplaceSourceMap.toString(), await stringReplaceSourceMap.generateSourceMap(), substrIndex);
  });

  it('should replace a multi-line string with a single-line string', async () => {
    const substr = `\`
  Multi-line original string 1
foobar\``;
    const substrIndex = originalFile.indexOf(substr);
    const replacementString = "'single line string'";
    stringReplaceSourceMap.replace(substrIndex, substrIndex + substr.length, replacementString);
    expect(stringReplaceSourceMap.toString().substring(substrIndex, substrIndex + replacementString.length))
        .toEqual(replacementString);

    await verifySourceMap(
        originalFile, stringReplaceSourceMap.toString(), await stringReplaceSourceMap.generateSourceMap(), substrIndex);
  });

  it('should replace a multi-line string with a multi-line string', async () => {
    const substr = `\`
  Multi-line
  original
  string
  2\``;
    const substrIndex = originalFile.indexOf(substr);
    const replacementString = `\`shorter
multi-linestring\``;
    stringReplaceSourceMap.replace(substrIndex, substrIndex + substr.length, replacementString);
    expect(stringReplaceSourceMap.toString().substring(substrIndex, substrIndex + replacementString.length))
        .toEqual(replacementString);

    await verifySourceMap(
        originalFile, stringReplaceSourceMap.toString(), await stringReplaceSourceMap.generateSourceMap(), substrIndex);
  });
});
