import { replaceInFile } from 'replace-in-file';

const options = {
    files: [
        'lib/**/*.d.ts',  
        'lib/**/*.js'      
    ],
    from: [/"pcui"/g],  
    to: ['"@playcanvas/pcui"'],
};

(async () => {
    try {
        const results = await replaceInFile(options);
        console.log(`Modified .d.ts files:`, results.filter(r => r.hasChanged).map(r => r.file));
    } catch (error) {
        console.error('Error occurred:', error);
    }
})();