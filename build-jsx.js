#!/usr/bin/env node

/**
 * Pre-compile JSX files to JavaScript before build
 * This ensures that Electron-builder includes them in the final bundle
 */

const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

const rendererDir = path.join(__dirname, 'src', 'renderer');
const outputDir = path.join(rendererDir, 'dist');

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

console.log('🔨 Compilando JSX a JavaScript...');

// List of JSX files to compile
const jsxFiles = ['App.jsx', 'index.jsx'];

jsxFiles.forEach(file => {
  const inputPath = path.join(rendererDir, file);
  const outputPath = path.join(outputDir, file.replace('.jsx', '.js'));

  if (!fs.existsSync(inputPath)) {
    console.warn(`⚠️  Archivo no encontrado: ${inputPath}`);
    return;
  }

  try {
    const code = fs.readFileSync(inputPath, 'utf8');

    // Compile using Babel
    const result = babel.transformSync(code, {
      plugins: ['@babel/plugin-transform-react-jsx'],
      presets: ['@babel/preset-env'],
      filename: file
    });

    // Write compiled output
    fs.writeFileSync(outputPath, result.code, 'utf8');
    console.log(`✅ ${file} → ${path.basename(outputPath)}`);
  } catch (err) {
    console.error(`❌ Error compilando ${file}:`, err.message);
    process.exit(1);
  }
});

// Also copy components and hooks if they exist
const dirsToInclude = ['components', 'hooks', 'store'];

dirsToInclude.forEach(dir => {
  const sourcePath = path.join(rendererDir, dir);
  const destPath = path.join(outputDir, dir);

  if (fs.existsSync(sourcePath)) {
    // Simple recursive copy
    function copyRecursive(src, dest) {
      if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
      }

      const files = fs.readdirSync(src);
      files.forEach(file => {
        const srcFile = path.join(src, file);
        const destFile = path.join(dest, file);

        if (fs.statSync(srcFile).isDirectory()) {
          copyRecursive(srcFile, destFile);
        } else {
          fs.copyFileSync(srcFile, destFile);
        }
      });
    }

    copyRecursive(sourcePath, destPath);
    console.log(`✅ Carpeta copiada: ${dir}/`);
  }
});

console.log('✅ Pre-compilación completada');
