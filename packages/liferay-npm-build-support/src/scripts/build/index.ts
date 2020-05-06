/**
 * SPDX-FileCopyrightText: © 2017 Liferay, Inc. <https://liferay.com>
 * SPDX-License-Identifier: LGPL-3.0-or-later
 */

import fs from 'fs-extra';
import {error, info, print} from 'liferay-js-toolkit-core/lib/format';
import project from 'liferay-js-toolkit-core/lib/project';
import {ProjectType} from 'liferay-js-toolkit-core/lib/project/probe';
import path from 'path';

import {Renderer, runNodeModulesBin, runPkgJsonScript} from '../../util';

const msg = {
	unsupportedProjectType: [
		error`
		Oops! Your project type is not supported by {Liferay JS Toolkit} or 
		cannot be autodetected.
		`,
		info`
		Please visit http://bit.ly/js-toolkit-wiki for the full list of 
		supported project types and how they are detected.
		`,
	],
};

const scrLiferayDir = project.dir.join('src.liferay');

export default function(): void {
	switch (project.probe.type) {
		case ProjectType.ANGULAR_CLI:
			buildWith('build', ['--prod=true']);
			break;

		case ProjectType.CREATE_REACT_APP:
			buildWith('build');
			break;

		case ProjectType.VUE_CLI:
			buildWith('build', ['--prod=true']);
			break;

		default:
			print(msg.unsupportedProjectType);
			process.exit(1);
	}
}

/**
 * @param {string} script
 * @param {Array<*>} args
 */
function buildWith(script, args = []): void {
	runPkgJsonScript(script, args);

	try {
		const templatesPath = path.join(
			__dirname,
			'..',
			'..',
			'resources',
			'build',
			project.probe.type
		);

		const renderer = new Renderer(templatesPath, scrLiferayDir.asNative);

		const {pkgJson} = project;

		renderer.render('adapt-rt.js', {
			project,
		});
		renderer.render('index.js', {
			pkgJson,
		});

		runNodeModulesBin('liferay-npm-bundler');
	} finally {
		fs.removeSync(scrLiferayDir.asNative);
	}
}
