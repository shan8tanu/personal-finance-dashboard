import { execFile } from "child_process";
import path from "path";

interface ParseResult {
  transactions: any[];
  metadata?: any;
}

function runPythonScript(scriptName: string, args: string[]): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, "..", "parsers", scriptName);

    execFile("python", [scriptPath, ...args], { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const errorMsg = stderr || error.message;
        if (errorMsg.includes("InvalidPassword") || errorMsg.includes("password")) {
          reject({ status: 400, message: "Invalid PDF password" });
        } else if (errorMsg.includes("FormatError") || errorMsg.includes("format")) {
          reject({ status: 422, message: "Unrecognized PDF format" });
        } else {
          reject({ status: 500, message: `PDF parsing failed: ${errorMsg}` });
        }
        return;
      }

      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch {
        reject({ status: 500, message: "Failed to parse script output" });
      }
    });
  });
}

export async function parseBankStatement(filePath: string, password?: string): Promise<ParseResult> {
  const args = [filePath];
  if (password) args.push("--password", password);
  return runPythonScript("parse_bank_statement.py", args);
}

export async function parseCreditCardStatement(filePath: string): Promise<ParseResult> {
  return runPythonScript("parse_cc_statement.py", [filePath]);
}
