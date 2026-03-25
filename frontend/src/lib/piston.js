// Judge0 (RapidAPI) code execution service

const JUDGE0_HOST =
  import.meta.env.VITE_RAPIDAPI_HOST || "judge0-ce.p.rapidapi.com";
const JUDGE0_BASE_URL = `https://${JUDGE0_HOST}`;
const RAPIDAPI_KEY = import.meta.env.VITE_RAPIDAPI_KEY;

const LANGUAGE_IDS = {
  javascript: 63, // JavaScript (Node.js)
  python: 71, // Python
  java: 62, // Java
};

/**
 * @param {string} language - programming language
 * @param {string} code - source code to execute
 * @param {string} [stdin=""] - standard input
 * @returns {Promise<{success:boolean, output?:string, error?: string}>}
 */
export async function executeCode(language, code, stdin = "") {
  try {
    const languageId = LANGUAGE_IDS[language];

    if (!languageId) {
      return {
        success: false,
        error: `Unsupported language: ${language}`,
      };
    }

    if (!RAPIDAPI_KEY) {
      return {
        success: false,
        error: "Missing VITE_RAPIDAPI_KEY in frontend/.env",
      };
    }

    const headers = {
      "Content-Type": "application/json",
      "x-rapidapi-key": RAPIDAPI_KEY,
      "x-rapidapi-host": JUDGE0_HOST,
    };

    // 1) submit code (official style: base64_encoded=true)
    const submitRes = await fetch(
      `${JUDGE0_BASE_URL}/submissions?base64_encoded=true&wait=false&fields=*`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          language_id: languageId,
          source_code: toBase64(code),
          stdin: toBase64(stdin),
        }),
      },
    );

    if (!submitRes.ok) {
      return {
        success: false,
        error: `Submit failed: HTTP ${submitRes.status}`,
      };
    }

    const { token } = await submitRes.json();
    if (!token) {
      return {
        success: false,
        error: "No submission token returned from Judge0",
      };
    }

    // 2) poll result
    const maxRetries = 20;
    const intervalMs = 800;

    for (let i = 0; i < maxRetries; i++) {
      const resultRes = await fetch(
        `${JUDGE0_BASE_URL}/submissions/${token}?base64_encoded=true&fields=stdout,stderr,compile_output,message,status`,
        { method: "GET", headers },
      );

      if (!resultRes.ok) {
        return {
          success: false,
          error: `Result fetch failed: HTTP ${resultRes.status}`,
        };
      }

      const result = await resultRes.json();
      const statusId = result?.status?.id;

      // 1/2: in queue / processing
      if (statusId === 1 || statusId === 2) {
        await sleep(intervalMs);
        continue;
      }

      const output = fromBase64(result?.stdout || "");
      const errorMsg =
        fromBase64(result?.stderr || "") ||
        fromBase64(result?.compile_output || "") ||
        fromBase64(result?.message || "");

      if (statusId === 3) {
        return {
          success: true,
          output: output || "No output",
        };
      }

      return {
        success: false,
        output,
        error:
          errorMsg ||
          `Execution failed with status: ${result?.status?.description || "Unknown"}`,
      };
    }

    return {
      success: false,
      error: "Execution timeout. Please try again.",
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to execute code: ${error.message}`,
    };
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toBase64(str) {
  const bytes = new TextEncoder().encode(str ?? "");
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(b64) {
  if (!b64) return "";
  try {
    const binary = atob(b64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return b64;
  }
}
