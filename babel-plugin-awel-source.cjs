/**
 * Babel plugin that injects data-source-loc and data-source-component
 * attributes into JSX elements so the Awel inspector can map DOM nodes
 * back to source code.
 *
 * Only processes user code (skips node_modules) and only targets
 * intrinsic HTML elements (lowercase tags) to avoid passing unknown
 * props into React components.
 */
module.exports = function ({ types: t }) {
  return {
    name: 'awel-source',
    visitor: {
      JSXOpeningElement(path, state) {
        if (process.env.NODE_ENV === 'production') return;

        const filename = state.filename;
        if (!filename || filename.includes('node_modules')) return;

        const name = path.node.name;

        // Only add to intrinsic HTML elements (lowercase), not React components
        if (!t.isJSXIdentifier(name) || !/^[a-z]/.test(name.name)) return;

        const attrs = path.node.attributes;

        // Skip if already annotated
        if (attrs.some(a => t.isJSXAttribute(a) && a.name && a.name.name === 'data-source-loc')) return;

        const loc = path.node.loc && path.node.loc.start;
        if (!loc) return;

        // Make path relative to project root
        const cwd = state.cwd || process.cwd();
        const relative = filename.startsWith(cwd)
          ? filename.slice(cwd.length + 1)
          : filename;

        // data-source-loc="file:line:col"
        attrs.push(
          t.jsxAttribute(
            t.jsxIdentifier('data-source-loc'),
            t.stringLiteral(relative + ':' + loc.line + ':' + (loc.column || 0))
          )
        );

        // Walk up AST to find the enclosing React component name
        var parent = path.parentPath;
        while (parent) {
          var node = parent.node;
          var componentName = null;

          if (parent.isFunctionDeclaration() && node.id) {
            componentName = node.id.name;
          } else if (
            (parent.isArrowFunctionExpression() || parent.isFunctionExpression()) &&
            parent.parentPath &&
            parent.parentPath.isVariableDeclarator() &&
            t.isIdentifier(parent.parentPath.node.id)
          ) {
            componentName = parent.parentPath.node.id.name;
          }

          if (componentName && /^[A-Z]/.test(componentName)) {
            attrs.push(
              t.jsxAttribute(
                t.jsxIdentifier('data-source-component'),
                t.stringLiteral(componentName)
              )
            );
            break;
          }

          parent = parent.parentPath;
        }
      }
    }
  };
};
