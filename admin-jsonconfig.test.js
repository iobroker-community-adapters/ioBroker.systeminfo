const assert = require('assert');
const fs = require('fs');
const path = require('path');

describe('jsonConfig migration', () => {
    const rootDir = __dirname;
    const ioPackage = JSON.parse(fs.readFileSync(path.join(rootDir, 'io-package.json'), 'utf8'));
    const jsonConfig = JSON.parse(fs.readFileSync(path.join(rootDir, 'admin', 'jsonConfig.json'), 'utf8'));

    it('enables json admin UI in io-package', () => {
        assert.deepStrictEqual(ioPackage.common.adminUI, { config: 'json' });
    });

    it('preserves the startup field and items table schema', () => {
        assert.strictEqual(jsonConfig.type, 'panel');
        assert.strictEqual(jsonConfig.i18n, true);
        assert.strictEqual(jsonConfig.items.startup.type, 'text');
        assert.strictEqual(jsonConfig.items.startup.trim, false);

        const attrs = jsonConfig.items.items.items.map((item) => item.attr);
        assert.deepStrictEqual(attrs, ['name', 'type', 'source', 'regexp', 'conv', 'role', 'write', 'sched']);
        assert.strictEqual(jsonConfig.items.items.useCardFor.join(','), 'xs,sm,md');
        assert.strictEqual(jsonConfig.items.items.titleAttribute, 'name');
    });

    it('provides short-form i18n files for jsonConfig labels', () => {
        for (const lang of ['en', 'de']) {
            const file = path.join(rootDir, 'admin', 'i18n', `${lang}.json`);
            assert.strictEqual(fs.existsSync(file), true, `${lang}.json should exist`);
            const translations = JSON.parse(fs.readFileSync(file, 'utf8'));
            assert.ok(translations['Startup commands']);
            assert.ok(translations['Items setup']);
            assert.ok(translations['WriteCommand']);
        }
    });
});
