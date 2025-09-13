import { describe, it, expect, vi, beforeEach } from "vitest"
import { GeminiCliHandler } from "../gemini-cli"
import { Anthropic } from "@anthropic-ai/sdk"
import * as fs from "fs/promises"

// Mock fs promises
vi.mock("fs/promises", () => ({
	readFile: vi.fn(),
	writeFile: vi.fn(),
}))

// Mock google-auth-library
vi.mock("google-auth-library", () => ({
	OAuth2Client: vi.fn().mockImplementation(() => ({
		setCredentials: vi.fn(),
		refreshAccessToken: vi.fn().mockResolvedValue({
			credentials: {
				access_token: "new-access-token",
				refresh_token: "refresh-token",
				expiry_date: Date.now() + 3600 * 1000,
			},
		}),
		request: vi.fn().mockImplementation(({ url, data }) => {
			if (url.includes("streamGenerateContent")) {
				// Mock streaming response
				return {
					data: mockSSEStream(),
				}
			} else if (url.includes("generateContent")) {
				// Mock non-streaming response
				return {
					data: {
						candidates: [
							{
								content: {
									parts: [{ text: "Test completion response" }],
								},
							},
						],
					},
				}
			} else if (url.includes("loadCodeAssist")) {
				return {
					data: {
						cloudaicompanionProject: "test-project-id",
					},
				}
			}
			return { data: {} }
		}),
	})),
}))

// Mock axios
vi.mock("axios", () => ({
	default: {
		request: vi.fn(),
	},
}))

// Mock the translation function
vi.mock("../../i18n", () => ({
	t: vi.fn((key: string, params?: any) => {
		if (params) {
			return `${key} with ${JSON.stringify(params)}`
		}
		return key
	}),
}))

// Create a mock SSE stream
function mockSSEStream() {
	return {
		[Symbol.asyncIterator]: async function* () {
			yield Buffer.from('data: {"response":{"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}}\n\n')
			yield Buffer.from('data: {"response":{"candidates":[{"content":{"parts":[{"text":" world"}]}}]}}\n\n')
			yield Buffer.from(
				'data: {"response":{"candidates":[{"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":5}}}\n\n',
			)
		},
	}
}

describe("GeminiCliHandler", () => {
	let handler: GeminiCliHandler

	beforeEach(() => {
		vi.clearAllMocks()

		// Mock successful OAuth credential loading
		;(fs.readFile as any).mockResolvedValue(
			JSON.stringify({
				access_token: "test-access-token",
				refresh_token: "test-refresh-token",
				token_type: "Bearer",
				expiry_date: Date.now() + 3600 * 1000, // 1 hour from now
			}),
		)

		handler = new GeminiCliHandler({})
	})

	describe("constructor", () => {
		it("should create an instance", () => {
			expect(handler).toBeInstanceOf(GeminiCliHandler)
		})
	})

	describe("getModel", () => {
		it("should return default model when no apiModelId is provided", () => {
			const model = handler.getModel()
			expect(model.id).toBe("gemini-2.0-flash-001")
			expect(model.info).toBeDefined()
			expect(model.info.contextWindow).toBe(1_048_576)
		})

		it("should return specified model when apiModelId is provided", () => {
			const customHandler = new GeminiCliHandler({
				apiModelId: "gemini-1.5-flash-002",
			})
			const model = customHandler.getModel()
			expect(model.id).toBe("gemini-1.5-flash-002")
		})

		it("should fall back to default model for invalid apiModelId", () => {
			const customHandler = new GeminiCliHandler({
				apiModelId: "invalid-model",
			})
			const model = customHandler.getModel()
			expect(model.id).toBe("gemini-2.0-flash-001")
		})

		it("should handle thinking suffix in model ID", () => {
			const customHandler = new GeminiCliHandler({
				apiModelId: "gemini-1.5-flash-002:thinking",
			})
			const model = customHandler.getModel()
			expect(model.id).toBe("gemini-1.5-flash-002")
		})
	})

	describe("createMessage", () => {
		it("should stream messages from Gemini CLI", async () => {
			const systemPrompt = "You are a helpful assistant"
			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: "Hello, how are you?",
				},
			]

			const stream = handler.createMessage(systemPrompt, messages)
			const results = []

			for await (const chunk of stream) {
				results.push(chunk)
			}

			// Should have text chunks and usage chunk
			expect(results.length).toBeGreaterThanOrEqual(2)

			// Find text chunks
			const textChunks = results.filter((r) => r.type === "text")
			expect(textChunks.length).toBeGreaterThanOrEqual(1)
			expect(textChunks[0]).toEqual({ type: "text", text: "Hello" })

			// Should have usage chunk
			const usageChunk = results.find((r) => r.type === "usage")
			expect(usageChunk).toMatchObject({
				type: "usage",
				inputTokens: 10,
				outputTokens: 5,
				totalCost: expect.any(Number),
			})
		})

		it("should handle reasoning/thought events", async () => {
			// Mock a stream with thinking parts
			const mockOAuth = {
				setCredentials: vi.fn(),
				refreshAccessToken: vi.fn(),
				request: vi.fn().mockImplementation(({ url }) => {
					if (url.includes("loadCodeAssist")) {
						return Promise.resolve({
							data: {
								cloudaicompanionProject: "test-project-id",
							},
						})
					} else if (url.includes("streamGenerateContent")) {
						return Promise.resolve({
							data: {
								[Symbol.asyncIterator]: async function* () {
									yield Buffer.from(
										'data: {"response":{"candidates":[{"content":{"parts":[{"text":"Let me think...","thought":true}]}}]}}\n\n',
									)
									yield Buffer.from(
										'data: {"response":{"candidates":[{"content":{"parts":[{"text":"Final answer"}]}}]}}\n\n',
									)
									yield Buffer.from(
										'data: {"response":{"candidates":[{"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":5}}}\n\n',
									)
								},
							},
						})
					}
					return Promise.resolve({ data: {} })
				}),
			}

			// Override the OAuth client for this test
			;(handler as any).authClient = mockOAuth

			const stream = handler.createMessage("System", [{ role: "user", content: "Test" }])
			const results = []

			for await (const chunk of stream) {
				results.push(chunk)
			}

			expect(results[0]).toEqual({ type: "reasoning", text: "Let me think..." })
			expect(results[1]).toEqual({ type: "text", text: "Final answer" })
		})

		it("should handle OAuth credential loading errors", async () => {
			;(fs.readFile as any).mockRejectedValue(new Error("File not found"))

			const customHandler = new GeminiCliHandler({})
			const stream = customHandler.createMessage("System", [{ role: "user", content: "Test" }])

			await expect(async () => {
				for await (const _ of stream) {
					// Should throw before yielding anything
				}
			}).rejects.toThrow()
		})
	})

	describe("completePrompt", () => {
		it("should complete a prompt", async () => {
			const result = await handler.completePrompt("What is 2 + 2?")
			expect(result).toBe("Test completion response")
		})

		it("should handle empty response", async () => {
			const mockOAuth = {
				setCredentials: vi.fn(),
				refreshAccessToken: vi.fn(),
				request: vi.fn().mockImplementation(({ url }) => {
					if (url.includes("loadCodeAssist")) {
						return {
							data: {
								cloudaicompanionProject: "test-project-id",
							},
						}
					}
					return {
						data: {
							candidates: [],
						},
					}
				}),
			}

			// Override the OAuth client for this test
			;(handler as any).authClient = mockOAuth

			const result = await handler.completePrompt("Test")
			expect(result).toBe("")
		})

		it("should filter out thought parts from completion", async () => {
			const mockOAuth = {
				setCredentials: vi.fn(),
				refreshAccessToken: vi.fn(),
				request: vi.fn().mockImplementation(({ url }) => {
					if (url.includes("loadCodeAssist")) {
						return {
							data: {
								cloudaicompanionProject: "test-project-id",
							},
						}
					}
					return {
						data: {
							candidates: [
								{
									content: {
										parts: [{ text: "Thinking...", thought: true }, { text: "The answer is 4" }],
									},
								},
							],
						},
					}
				}),
			}

			// Override the OAuth client for this test
			;(handler as any).authClient = mockOAuth

			const result = await handler.completePrompt("What is 2 + 2?")
			expect(result).toBe("The answer is 4")
		})
	})

	describe("countTokens", () => {
		it("should fall back to base implementation", async () => {
			const content: Anthropic.Messages.ContentBlockParam[] = [
				{
					type: "text",
					text: "Test content for token counting",
				},
			]

			// The implementation falls back to the base class
			const count = await handler.countTokens(content)
			expect(count).toBeGreaterThan(0)
		})
	})

	describe("OAuth token refresh", () => {
		it("should refresh expired tokens", async () => {
			// Mock expired credentials
			;(fs.readFile as any).mockResolvedValue(
				JSON.stringify({
					access_token: "expired-token",
					refresh_token: "test-refresh-token",
					token_type: "Bearer",
					expiry_date: Date.now() - 1000, // Expired 1 second ago
				}),
			)

			const customHandler = new GeminiCliHandler({})
			const result = await customHandler.completePrompt("Test")

			// Should still work after token refresh
			expect(result).toBe("Test completion response")
		})
	})

	describe("project discovery", () => {
		it("should use provided project ID", async () => {
			const customHandler = new GeminiCliHandler({
				geminiCliProjectId: "custom-project-id",
			})

			const result = await customHandler.completePrompt("Test")
			expect(result).toBe("Test completion response")
		})

		it("should discover project ID from API", async () => {
			// The default mock already handles project discovery
			const result = await handler.completePrompt("Test")
			expect(result).toBe("Test completion response")
		})
	})
})
