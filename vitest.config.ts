import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json'],
            include: [
                'src/anim/spline.ts',
                'src/index-ranges.ts'
            ],
            // Most source files are browser/WebGL/editor integration code and currently have no
            // Node-safe unit harness. Keep enforced 100% coverage on pure unit-testable modules.
            thresholds: {
                lines: 100,
                functions: 100,
                branches: 100,
                statements: 100
            }
        }
    }
});
