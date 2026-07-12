const fs = require('fs');
const ts = require('typescript');
const content = fs.readFileSync('app/admin/page.tsx', 'utf8');
const sourceFile = ts.createSourceFile('page.tsx', content, ts.ScriptTarget.Latest, true);
function traverse(node) {
  if (ts.isCallExpression(node) && 
      node.expression.getText(sourceFile) === 'Promise.all') {
    const args = node.arguments;
    if (args.length > 0 && ts.isArrayLiteralExpression(args[0])) {
      const elements = args[0].elements;
      elements.forEach((el, i) => {
        console.log(`[Query ${i}]:\n${el.getText(sourceFile)}\n`);
      });
      process.exit(0);
    }
  }
  ts.forEachChild(node, traverse);
}
traverse(sourceFile);
