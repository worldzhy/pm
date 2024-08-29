const fs = require('fs');
const {ALL_MICROSERVICES} = require('../constants/microservices.constants');
const {ENABLED_PATH} = require('../constants/path.constants');
const {execSync} = require('child_process');
const {getObjectFromEnvFile} = require('../utilities/env.util');

const envObj = getObjectFromEnvFile();
const isNewbieDeveloper = () => envObj['NEWBIE_DEVELOPER'] === 'true';

const assembleRepositories = (addedMicroservices, removedMicroservices) => {
  addedMicroservices.forEach(name => {
    const {key, srcPath, repositoryUrl} = ALL_MICROSERVICES[name] || {};
    const microserviceNewbiePath = `${srcPath}/.newbie`;

    if (!key) return;
    try {
      execSync(`git submodule add ${repositoryUrl} ${srcPath}`);
    } catch (error) {
      execSync(`git submodule deinit -f ${srcPath}`);
      execSync(`git rm -r --cached ${srcPath}`);
      execSync(`rm -rf .git/modules/${srcPath}`);
      execSync(`git submodule add ${repositoryUrl} ${srcPath}`);
    }

    if (microserviceNewbiePath && fs.existsSync(microserviceNewbiePath)) {
      execSync(`cp -rf ${microserviceNewbiePath} ${ENABLED_PATH}/${key}`);
    }
  });

  removedMicroservices.forEach(name => {
    const {key, srcPath} = ALL_MICROSERVICES[name] || {};

    if (!key) {
      return;
    }
    if (isNewbieDeveloper()) {
      try {
        execSync(`git submodule deinit -f ${srcPath}`);
        execSync(`git rm -r --cached ${srcPath}`);
        execSync(`rm -rf .git/modules/${srcPath}`);
      } catch (error) {}
    }

    try {
      execSync(`rm -rf ${srcPath}`);
      execSync(
        `git config -f .gitmodules --remove-section submodule.${srcPath}`
      );
    } catch (error) {}
  });

  if (!isNewbieDeveloper() && addedMicroservices.length) {
    addedMicroservices.forEach(name => {
      const {key, srcPath} = ALL_MICROSERVICES[name] || {};
      const newbiePath = `${srcPath}/.newbie`;

      if (!key) return;
      execSync(`cp -r ${srcPath} ${srcPath}_temp`);
      execSync(`git submodule deinit -f ${srcPath}`);
      execSync(`git rm --cached ${srcPath} -r`);
      execSync(`rm -rf .git/modules/${srcPath}`);
      execSync(`rm -rf ${srcPath}`);
      execSync(`mv ${srcPath}_temp ${srcPath}`);
      if (fs.existsSync(newbiePath)) {
        execSync(`rm -rf ${newbiePath}`);
      }
    });
  }
};

module.exports = {
  assembleRepositories,
};
