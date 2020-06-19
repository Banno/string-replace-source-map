# string-replace-source-map

Replace substrings in a file and update an associated source map.

## Use cases

Updating late loaded file paths post-compilation:

**original**
```js
import('/path/to/module1.js');
```

**replaced**
```js
import('/path/to/module1-ab123asdf.js');
```

Minifying html content in a web component:

**original**
```js
class MyCustomElement extends Polymer.Element {
  static get is() { return 'my-custom'; }
  static get template() {
    return html`
    <style>
      div { background-color: green; }
    </style>
    <div>
    </div>`;
  }
}
```

**replaced**
```js
class MyCustomElement extends Polymer.Element {
  static get is() { return 'my-custom'; }
  static get template() {
    return html`<style>div{background-color:green;}</style><div></div>`;
  }
}
```

### API

**constructor**
Parameters include an original source string and an original source map. The source map may be provided
either as a JSON object or as string.
```js
const stringReplaceSourceMap = new StringReplaceSourceMap(originalString, originalMap);
```

**replace**
Requires a numeric beginning index which is inclusive, an endding index which is exclusive and an replacement substring.
Omitting, passing null or undefined for the replacement string will simply remove the original content.

Multiple replacements can be added to the same original string, but the replacement indexes must not overlap.
```js
stringReplaceSourceMap.replace(beginIndex, endIndex, replacementString);
```

**prepend**
Prepends a new string to the output. This method may be called multiple times and each new string will be added in order.
```js
stringReplaceSourceMap.prepend(newString);
```

**append**
Appends a new string to the output. This method may be called multiple times and each new string will be added in order.

This method is added for convenience, but appending a string does not impact a source map so this isn't stricly required.
```js
stringReplaceSourceMap.append(newString);
```

**toString**
Output the new string with all the replacements
```js
stringReplaceSourceMap.toString();
```

**generateMap**
Returns a promise which resolves to a source map (in JSON format) with all the mappings updated for the replacement.
```js
const sourceMap = await stringReplaceSourceMap.generateMap();
```

## Example usage

```js
const StringReplaceSourceMap = require('string-replace-source-map');
const stringReplaceSourceMap = new StringReplaceSourceMap(originalString, originalMap);
stringReplaceSourceMap.replace(beginIndex, endIndex, newSubString);

console.log('New string', stringReplaceSourceMap.toString());
stringReplaceSourceMap.generateMap()
  .then((updatedSourceMap) => console.log('Updated source map', updatedSourceMap));
```
