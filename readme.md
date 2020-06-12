# string-replace-source-map

Replace substrings in a file and update an associated source map.

## Usage

```js
const StringReplaceSourceMap = require('string-replace-source-map');
const stringReplaceSourceMap = new StringReplaceSourceMap(originalString, originalMap);
stringReplaceSourceMap.replace(beginIndex, endIndex, newSubString);

console.log('New string', stringReplaceSourceMap.toString());
stringReplaceSourceMap.generateMap()
  .then((updatedSourceMap) => console.log('Updated source map', stringReplaceSourceMap.generateMap()));
```
