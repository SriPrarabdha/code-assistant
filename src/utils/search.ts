import SnippetExtractors from "./extractors";
import { SnippetResult } from "./extractors/ExtractorAbstract";

import { FetchPageResult, fetchPageTextContent } from "./fetchPageContent";

import * as vscode from "vscode";
import { getConfig } from "../config";

/**
 * Cache results to avoid VSCode keep refetching
 */
const cachedResults: { [keyword: string]: SnippetResult[] } = {};

// Send search query to google, get answers from stackoverflow
// then extract and return code results
export async function search(
  keyword: string
): Promise<null | { results: SnippetResult[] }> {

  if (keyword in cachedResults) {
    return Promise.resolve({ results: cachedResults[keyword] });
  }

  const config = getConfig();
  console.log(config);

  /* eslint "no-async-promise-executor": "off" */
  const promise = new Promise<{ results: SnippetResult[] }>(
    async (resolve, reject) => {
      let results: SnippetResult[] = [];
      let fetchResult: FetchPageResult;

      try {
        for (const i in SnippetExtractors) {
          const extractor = SnippetExtractors[i];

          if (extractor.isEnabled()) {
            if (extractor.generateCode) {
              if (!config.settings.OpenAI) {
                vscode.window.setStatusBarMessage(
                  `Unable to find API Key for ${extractor.name}`,
                  2000
                );
                return [];
              }

              const task = vscode.window.setStatusBarMessage(`Generate code...`);
              // @ts-ignore
              const providerSettings = config.settings[extractor.name];
              const generated = await extractor.generateCode(keyword, {
                ...providerSettings,
                ...config.settings.ai
              });
              results = results.concat(
                generated.map((code) => ({
                  votes: 0,
                  hasCheckMark: false,
                  sourceURL: `Generated by ${extractor.name} (${providerSettings.model})`,
                  code,
                }))
              );
              task.dispose();
              break;
            }

            const urls = await extractor.extractURLFromKeyword(keyword);

            for (const y in urls) {
              fetchResult = await fetchPageTextContent(urls[y]);
              results = results.concat(extractor.extractSnippets(fetchResult));

              vscode.window.setStatusBarMessage(
                `${extractor.name} (${y}/${urls.length}): ${results.length} results`,
                2000
              );

              if (results.length >= config.settings.maxResults) {
                break;
              }
            }

            if (results.length >= config.settings.maxResults) {
              break;
            }
          }
        }

        cachedResults[keyword] = results;

        resolve({ results });
      } catch (err) {
        reject(err);
      }

      // When promise resolved, show finished loading for 5 seconds
      vscode.window.setStatusBarMessage(
        `code assistant: Finished loading ${results.length} results`
      );
    }
  );

  vscode.window.setStatusBarMessage(
    `CodeAssistant: Start loading snippet results...`,
    promise
  );
  return promise;
}
