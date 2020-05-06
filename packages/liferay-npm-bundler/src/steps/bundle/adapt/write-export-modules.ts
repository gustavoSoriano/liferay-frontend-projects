/**
 * SPDX-FileCopyrightText: © 2020 Liferay, Inc. <https://liferay.com>
 * SPDX-License-Identifier: LGPL-3.0-or-later
 */

import fs from 'fs-extra';
import FilePath from 'liferay-js-toolkit-core/lib/file-path';
import * as mod from 'liferay-js-toolkit-core/lib/modules';
import * as ns from 'liferay-js-toolkit-core/lib/namespace';
import * as pkgs from 'liferay-js-toolkit-core/lib/packages';
import PkgDesc from 'liferay-js-toolkit-core/lib/pkg-desc';
import project, {PkgJson} from 'liferay-js-toolkit-core/lib/project';

import {buildBundlerDir} from '../../../dirs';
import * as log from '../../../log';
import manifest from '../../../manifest';
import {render} from './util';

/**
 * Generates one AMD module per export. The generated module loads webpack's
 * runtime, the vendor bundle (common split) and the exported module itself.
 */
export default async function writeExportModules(): Promise<void> {
	await Promise.all(
		Object.entries(project.exports).map(async ([id, moduleName]) => {
			if (mod.isLocalModule(moduleName)) {
				await writeLocalExportModule(id, moduleName);
			} else {
				await writeDependencyExportModule(id, moduleName);
			}

			log.debug(`Generated AMD module ${moduleName}`);
		})
	);
}

async function writeDependencyExportModule(
	id: string,
	moduleName: string
): Promise<void> {
	const {modulePath, pkgName, scope} = mod.splitModuleName(moduleName);

	const canonicalModulePath = modulePath || '/index.js';
	const scopedPkgName = mod.joinModuleName(scope, pkgName, '');
	const namespacedScopedPkgName = ns.addNamespace(
		scopedPkgName,
		project.pkgJson
	);

	const pkgJson: PkgJson = fs.readJsonSync(
		project.resolve(`${scopedPkgName}/package.json`)
	);
	const pkgDir = buildBundlerDir.join(
		'node_modules',
		pkgs.getPackageTargetDir(namespacedScopedPkgName, pkgJson.version)
	);

	await writeDependencyExportPkgJson(pkgDir, pkgJson);
	addPackageToManifest(pkgJson, pkgDir);

	moduleName =
		namespacedScopedPkgName + '@' + pkgJson.version + canonicalModulePath;

	moduleName = moduleName.replace(/\.js$/, '');

	await writeExportModule(
		pkgDir.join(new FilePath(canonicalModulePath, {posix: true})),
		id,
		moduleName,
		project.pkgJson.name
	);
}

function addPackageToManifest(pkgJson: PkgJson, destDir: FilePath): void {
	const {name, version} = pkgJson;

	const srcDirPath = project
		.resolve(`${name}/package.json`)
		.replace('/package.json', '');

	manifest.addPackage(
		new PkgDesc(name, version, project.dir.relative(srcDirPath).asPosix),
		new PkgDesc(
			ns.addNamespace(name, project.pkgJson),
			version,
			project.dir.relative(destDir).asPosix
		)
	);
}

/**
 * Writes the `package.json` file of an exported dependency package.
 *
 * @remarks
 * Because we don't export everything by default any more (like in bundler 2),
 * we must generate a very simple generated `package.json` just for Liferay to
 * process it and be compatible with bundler 2 artifacts.
 *
 * @param dir
 * @param pkgJson
 */
async function writeDependencyExportPkgJson(
	dir: FilePath,
	pkgJson: PkgJson
): Promise<void> {
	const generatedPkgJson: PkgJson = {
		dependencies: {
			[project.pkgJson.name]: project.pkgJson.version,
		},
		name: ns.addNamespace(pkgJson.name, project.pkgJson),
		version: pkgJson.version,
	};

	if (pkgJson.main) {
		generatedPkgJson.main = pkgJson.main;
	}

	const file = dir.join('package.json');

	// TODO: check if file needs regeneration to avoid webpack rebuilds
	fs.ensureDirSync(file.dirname().asNative);
	fs.writeFileSync(
		file.asNative,
		JSON.stringify(generatedPkgJson, null, '\t')
	);
}

/**
 * Writes the contents of an exports module file.
 *
 * @remarks
 * An export module file requires webpack's manifest, vendor and entry bundles
 * and re-exports the entry's exported object.
 *
 * @param moduleFile path to module file
 * @param id id of export entry
 * @param moduleName the full AMD name of the module
 * @param bundlesLocation location of webpack bundle files
 */
async function writeExportModule(
	moduleFile: FilePath,
	id: string,
	moduleName: string,
	bundlesLocation: string
): Promise<void> {
	// TODO: check if file needs regeneration to avoid webpack rebuilds
	fs.ensureDirSync(moduleFile.dirname().asNative);
	fs.writeFileSync(
		moduleFile.asNative,
		await render('export-module', {
			bundlesLocation,
			id,
			moduleName,
		})
	);
}

async function writeLocalExportModule(
	id: string,
	moduleName: string
): Promise<void> {
	const moduleFile = buildBundlerDir.join(
		new FilePath(moduleName, {posix: true})
	);

	const {name, version} = project.pkgJson;

	moduleName = `${name}@${version}/${moduleName
		.replace('./', '')
		.replace(/\.js$/, '')}`;

	const bundlesLocation = moduleFile.dirname().relative(buildBundlerDir)
		.asPosix;

	await writeExportModule(moduleFile, id, moduleName, bundlesLocation);
}
