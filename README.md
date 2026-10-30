# Aircraft

Shared aircraft code for 0SFS: the catalog, loading, visuals, animation, and the Aircraft panel. The Cessna 172, Vision Jet, and F-35B packages build on it.

The fly app depends on this package and runs its tests. From the `fly` directory, `npm test` includes them.

Aircraft definitions can declare `controls.flaps`, `controls.pitchTrim`, `controls.rollTrim`, and `controls.landingGear` independently. `resolveControlCapabilities(definition, drone)` preserves existing plane controls when omitted and defaults drone controls off. A drone with retractable gear enables `landingGear` explicitly; its initial gear state does not advertise a movable control.

## Community

- [Code of conduct](https://github.com/0SFS/.github/blob/main/CODE_OF_CONDUCT.md)
- [Contributing](https://github.com/0SFS/.github/blob/main/CONTRIBUTING.md)
- [License](LICENSE)
- [Security](https://github.com/0SFS/.github/blob/main/SECURITY.md)
