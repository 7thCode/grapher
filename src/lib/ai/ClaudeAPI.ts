/**
 * Claude API integration for SVG generation
 * Uses Anthropic's Claude API to generate SVG code from text prompts
 */

export interface SVGGenerationResult {
  svg: string
  prompt: string
  timestamp: number
}

export class ClaudeAPI {
  private apiKey: string
  private readonly API_URL = 'https://api.anthropic.com/v1/messages'
  // Claude Sonnet 4.5 (latest frontier model)
  private readonly MODEL = 'claude-sonnet-4-5-20250929'
  private readonly API_VERSION = '2023-06-01'

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('API key is required')
    }
    this.apiKey = apiKey
  }

  /**
   * Generate SVG code from a text prompt
   * @param prompt User's description of the desired SVG
   * @returns Promise<SVGGenerationResult> Generated SVG code
   */
  async generateSVG(prompt: string): Promise<SVGGenerationResult> {
    if (!prompt || prompt.trim().length === 0) {
      throw new Error('Prompt cannot be empty')
    }

    if (prompt.length > 1000) {
      throw new Error('Prompt is too long (max 1000 characters)')
    }

    const systemPrompt = `あなたはSVGコード生成の専門家です。ユーザーのプロンプトから、完全で有効なSVGコードを生成してください。

重要なルール:
1. 必ず完全なSVGタグ構造を出力 (<svg>...</svg>)
2. viewBox属性を適切に設定 (例: viewBox="0 0 400 300")
3. width="100%" height="100%" を設定して親要素にフィット
4. ユーザーが指定した色や形状を正確に反映
5. シンプルで読みやすいコードを生成
6. コメントや説明文は不要、SVGコードのみ出力
7. マークダウンのコードブロック(\`\`\`svg)で囲まない、生のSVGコードのみ

出力例:
<svg viewBox="0 0 400 300" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
  <circle cx="100" cy="100" r="50" fill="blue"/>
  <rect x="200" y="50" width="100" height="100" fill="red"/>
</svg>`

    // Retry logic for transient errors (429, 529)
    const maxRetries = 3
    let response: Response | null = null

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        response = await fetch(this.API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': this.API_VERSION
          },
          body: JSON.stringify({
            model: this.MODEL,
            max_tokens: 4096,
            temperature: 1.0,
            system: systemPrompt,
            messages: [
              {
                role: 'user',
                content: prompt
              }
            ]
          })
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          const status = response.status

          // Retry on 429 (rate limit) or 529 (overloaded)
          if ((status === 429 || status === 529) && attempt < maxRetries - 1) {
            const waitTime = Math.pow(2, attempt) * 1000 // Exponential backoff: 1s, 2s, 4s
            console.warn(`API ${status} error, retrying in ${waitTime}ms... (attempt ${attempt + 1}/${maxRetries})`)
            await new Promise(resolve => setTimeout(resolve, waitTime))
            continue
          }

          throw new Error(
            `API Error (${status}): ${errorData.error?.message || response.statusText}`
          )
        }

        // Success - break out of retry loop
        break
      } catch (error) {
        if (attempt === maxRetries - 1) {
          throw error
        }
        // Wait before retrying
        const waitTime = Math.pow(2, attempt) * 1000
        console.warn(`Request failed, retrying in ${waitTime}ms... (attempt ${attempt + 1}/${maxRetries})`)
        await new Promise(resolve => setTimeout(resolve, waitTime))
      }
    }

    if (!response) {
      throw new Error('Failed to get response after retries')
    }

    try {
      const data = await response.json()

      if (!data.content || !data.content[0] || !data.content[0].text) {
        throw new Error('Invalid API response: no content returned')
      }

      const generatedText = data.content[0].text
      const svgCode = this.extractSVG(generatedText)
      this.validateSVG(svgCode)

      return {
        svg: svgCode,
        prompt,
        timestamp: Date.now()
      }
    } catch (error) {
      if (error instanceof Error) {
        throw error
      }
      throw new Error('Unknown error occurred during SVG generation')
    }
  }

  /**
   * Extract SVG code from Claude's response
   * Handles both markdown code blocks and plain SVG
   */
  private extractSVG(text: string): string {
    // Try to match markdown code block first
    let match = text.match(/```svg\s*\n([\s\S]*?)```/)
    if (match && match[1]) {
      return match[1].trim()
    }

    // Try to match plain SVG tag
    match = text.match(/(<svg[\s\S]*?<\/svg>)/i)
    if (match && match[1]) {
      return match[1].trim()
    }

    // If no match, check if the entire text is SVG
    if (text.trim().startsWith('<svg') && text.trim().endsWith('</svg>')) {
      return text.trim()
    }

    throw new Error('No valid SVG code found in API response')
  }

  /**
   * Validate SVG code for basic structure and security
   */
  private validateSVG(svg: string): void {
    if (!svg || svg.trim().length === 0) {
      throw new Error('SVG code is empty')
    }

    // Check for required SVG tag
    if (!svg.toLowerCase().includes('<svg')) {
      throw new Error('Invalid SVG: missing <svg> opening tag')
    }

    if (!svg.toLowerCase().includes('</svg>')) {
      throw new Error('Invalid SVG: missing </svg> closing tag')
    }

    // Security: reject script tags (XSS prevention)
    if (svg.toLowerCase().includes('<script')) {
      throw new Error('Security: script tags are not allowed in SVG')
    }

    // Security: reject event handlers (XSS prevention)
    const dangerousAttributes = ['onload', 'onerror', 'onclick', 'onmouseover']
    for (const attr of dangerousAttributes) {
      if (svg.toLowerCase().includes(attr)) {
        throw new Error(`Security: ${attr} attribute is not allowed in SVG`)
      }
    }

    // Check for viewBox or width/height
    if (!svg.includes('viewBox') && !svg.includes('width')) {
      console.warn('Warning: SVG has no viewBox or width/height attributes')
    }
  }

  /**
   * Test API connection with a simple request
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.generateSVG('青い小さな円を1つ描いて')
      return true
    } catch (error) {
      console.error('API connection test failed:', error)
      return false
    }
  }
}