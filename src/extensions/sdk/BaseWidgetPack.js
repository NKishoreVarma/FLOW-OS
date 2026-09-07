import { BaseExtension } from './BaseExtension.js';

/**
 * BaseWidgetPack — base class for extensions that contribute dashboard widgets.
 *
 * Widgets are metadata-only from the backend's perspective: they declare
 * what data they need (via dataSourceSpec) and the frontend Widget SDK renders
 * them.  The backend registers widget metadata; the frontend resolves the
 * component from the extension bundle.
 */
export class BaseWidgetPack extends BaseExtension {
  constructor(manifest, api) {
    super(manifest, api);
    this._registeredWidgetIds = [];
  }

  /**
   * @returns {Array<{
   *   id: string,
   *   name: string,
   *   description: string,
   *   category: 'metric'|'chart'|'list'|'timeline'|'map'|'custom',
   *   size: 'sm'|'md'|'lg'|'xl',
   *   dataSourceSpec: {
   *     endpoint: string,
   *     refreshSeconds: number,
   *     permissions: string[]
   *   },
   *   componentPath: string   // relative to extension entrypoint (frontend)
   * }>}
   */
  widgetDefinitions() {
    throw new Error(`${this.constructor.name}.widgetDefinitions() must be implemented`);
  }

  async onEnable() {
    const defs = this.widgetDefinitions();
    for (const def of defs) {
      this.api.widgets.register({
        ...def,
        extensionId: this.id,
        extensionVersion: this.version,
      });
      this._registeredWidgetIds.push(def.id);
    }
  }

  async onDisable() {
    for (const id of this._registeredWidgetIds) {
      this.api.widgets.unregister(id);
    }
    this._registeredWidgetIds = [];
  }

  async healthCheck() {
    return { healthy: true, registeredWidgets: this._registeredWidgetIds };
  }
}
