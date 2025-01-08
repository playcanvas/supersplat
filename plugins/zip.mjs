import JSZip from 'jszip';
import { promises as fs } from 'fs';
import path from 'path';
import ignore from 'ignore';

export default function zipPlugin(options = {}) {
  const {
    input = [], // array of files/directories to zip
    output = 'output.zip', // output zip file name
    compression = 'DEFLATE'
  } = options;

  return {
    name: 'rollup-plugin-zip',
    async writeBundle() {
      const zip = new JSZip();
      
      // Load .gitignore rules if the file exists
      const ig = ignore().add([
        'package-lock.json',
        '*.ply'
      ]);
      
      // Add .gitignore rules if the file exists
      try {
        const gitignore = await fs.readFile('.gitignore', 'utf8');
        ig.add(gitignore);
      } catch (err) {
        console.log('No .gitignore found, using default ignores only');
      }

      // Helper to recursively add files from a directory
      async function addDirectory(dirPath, zipRoot) {
        const files = await fs.readdir(dirPath);
        for (const file of files) {
          const filePath = path.join(dirPath, file);
          const stat = await fs.stat(filePath);
          
          // Get relative path for gitignore checking
          const relativePath = path.relative(process.cwd(), filePath);
          
          // Skip if file is ignored by gitignore
          if (ig.ignores(relativePath)) {
            continue;
          }

          if (stat.isDirectory()) {
            await addDirectory(filePath, zipRoot.folder(file));
          } else {
            const content = await fs.readFile(filePath);
            zipRoot.file(file, content);
          }
        }
      }

      // Add all input files/directories
      for (const inputPath of input) {
        const stat = await fs.stat(inputPath);
        if (stat.isDirectory()) {
          await addDirectory(inputPath, zip);
        } else {
          const relativePath = path.relative(process.cwd(), inputPath);
          if (!ig.ignores(relativePath)) {
            const content = await fs.readFile(inputPath);
            zip.file(path.basename(inputPath), content);
          }
        }
      }

      // Create output directory if it doesn't exist
      const outputDir = path.dirname(output);
      await fs.mkdir(outputDir, { recursive: true });

      // Generate and write the zip file
      const content = await zip.generateAsync({
        type: 'nodebuffer',
        compression,
        compressionOptions: {
          level: 9
        }
      });

      await fs.writeFile(output, content);
    }
  };
}