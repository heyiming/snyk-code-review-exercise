import { RequestHandler } from 'express';
import { maxSatisfying } from 'semver';
import got from 'got';
import { NPMPackage } from './types';

type Package = { version: string; dependencies: Record<string, Package> };

/**
 * Attempts to retrieve package data from the npm registry and return it
 */
// idea this is a design question. Would it be easier to use package-lock.json to get the dependencies?
// Our version resolution may not always match the ones in package-lock.json. And the latter is the actual versions got installed

export const getPackage: RequestHandler = async function (req, res, next) {
  // idea: we may want to support non-npm registries such as private ones in the future
  
  const { name, version } = req.params; // review: input validation for security concerns and better error messages
  const dependencyTree = {};
  try {
    // review: 
    // 1. hardcoded registry url - should be configurable
    // 2. catch error and handle it for different cases such as package name not found/valid
    // 3. validate schema for the reponse
    // 4. cache and rate limit (and retries?) our calls to registries.
    // 5. if to implement all above, we may want to hanve a seperate function/module for it.
    const npmPackage: NPMPackage = await got( 
      `https://registry.npmjs.org/${name}`, // review: 
    ).json();

    const dependencies: Record<string, string> =
      npmPackage.versions[version].dependencies ?? {}; // review: we should throw an error if the version is not found
    for (const [name, range] of Object.entries(dependencies)) { // review: we can getDependencies concurrently.
      const subDep = await getDependencies(name, range);
      dependencyTree[name] = subDep;
    }

    return res
      .status(200)
      .json({ name, version, dependencies: dependencyTree });
  } catch (error) {
    return next(error);
  }
};

async function getDependencies(name: string, range: string): Promise<Package> {
  // review: this function has a lot of duplicate code with getPackage - pretty much everything after
  // version resolution is the same. We may want to refactor it.
  const npmPackage: NPMPackage = await got(
    `https://registry.npmjs.org/${name}`,
  ).json();

  const v = maxSatisfying(Object.keys(npmPackage.versions), range);// review: v is not the best name for a variable.
  const dependencies: Record<string, Package> = {};

  if (v) {
    const newDeps = npmPackage.versions[v].dependencies;
    for (const [name, range] of Object.entries(newDeps ?? {})) {
      dependencies[name] = await getDependencies(name, range);
    }
  }

  return { version: v ?? range, dependencies };
}
