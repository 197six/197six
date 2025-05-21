"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// Game constants
const GAME_WIDTH = 800
const GAME_HEIGHT = 600
const LINE_SPEED = 2
const GATE_SPEED = 2.53 // Increased by 15% from 2.2
const DIFFICULTY_INCREASE = 0.1 // 10% speed increase after 15 gates
const DIFFICULTY_GATE_THRESHOLD = 15 // Increase difficulty after this many gates
const BTC_SPEED_BOOST = 1.1 // Additional 10% speed when BTC is active
const SOL_SPEED_BOOST = 2.0 // 100% faster when SOL is active
const GATE_WIDTH = 50
const GATE_DISTANCE = GATE_WIDTH * 4 // Fixed distance of 4 gate widths
const INITIAL_GATE_GAP = 150 // Reduced by 40% from 250
const NARROW_GATE_GAP = 120 // Reduced by 40% from 200
const GATE_GAP_INCREASE_PERCENT = 50 // Increased from 20% to 50% for more noticeable effect
const LINE_X_POSITION = 100 // Fixed x position of the line
const BOUNCE_VELOCITY = -5.5 // Increased by 10% from -5
const GRAVITY = 0.22 // Increased by 10% from 0.2
const TOKEN_COLLECTION_RADIUS = 50 // Increased from 30 to 50 for easier collection
const SCREEN_FLASH_DURATION = 150 // Flash duration in milliseconds
const BCH_CHAOS_DURATION = 3000 // 3 seconds of chaos for BCH (increased from 1 second)
const SOL_EFFECT_DURATION = 5000 // 5 seconds of SOL effect
const MIN_VERTICAL_VARIANCE = -100 // Minimum vertical shift for gates
const MAX_VERTICAL_VARIANCE = 100 // Maximum vertical shift for gates

// Token types
enum TokenType {
  NONE = "none",
  BTC = "btc",
  ETH = "eth",
  TAO = "tao",
  BCH = "bch",
  HBAR = "hbar",
  SOL = "sol", // New SOL token
}

// Game states
enum GameState {
  START = 0,
  PLAYING = 1,
  GAME_OVER = 2,
}

// Game objects
interface Gate {
  x: number
  topHeight: number
  hasPassed: boolean
  tokenType: TokenType
  baseGateGap: number // Store the original gap
  isFlashing: boolean
}

interface TrailPoint {
  y: number
  isAscending: boolean
}

interface TokenEffect {
  type: TokenType
  endTime: number
}

interface TokenCounts {
  [TokenType.BTC]: number
  [TokenType.ETH]: number
  [TokenType.TAO]: number
  [TokenType.BCH]: number
  [TokenType.HBAR]: number
  [TokenType.SOL]: number
}

export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [gameState, setGameState] = useState<GameState>(GameState.START)
  const [score, setScore] = useState(0)
  const [highScore, setHighScore] = useState(0)
  const [tokenCounts, setTokenCounts] = useState<TokenCounts>({
    [TokenType.BTC]: 0,
    [TokenType.ETH]: 0,
    [TokenType.TAO]: 0,
    [TokenType.BCH]: 0,
    [TokenType.HBAR]: 0,
    [TokenType.SOL]: 0,
  })

  // New state for highest token counts
  const [highestTokenCounts, setHighestTokenCounts] = useState<TokenCounts>({
    [TokenType.BTC]: 0,
    [TokenType.ETH]: 0,
    [TokenType.TAO]: 0,
    [TokenType.BCH]: 0,
    [TokenType.HBAR]: 0,
    [TokenType.SOL]: 0,
  })

  // Use a ref to track token counts during gameplay
  const tokenCountsRef = useRef<TokenCounts>({
    [TokenType.BTC]: 0,
    [TokenType.ETH]: 0,
    [TokenType.TAO]: 0,
    [TokenType.BCH]: 0,
    [TokenType.HBAR]: 0,
    [TokenType.SOL]: 0,
  })

  // Load high score and highest token counts from localStorage on component mount
  useEffect(() => {
    const savedHighScore = localStorage.getItem("btcGameHighScore")
    if (savedHighScore) {
      setHighScore(Number.parseInt(savedHighScore, 10))
    }

    // Load highest token counts
    const savedHighestTokenCounts = localStorage.getItem("btcGameHighestTokenCounts")
    if (savedHighestTokenCounts) {
      try {
        setHighestTokenCounts(JSON.parse(savedHighestTokenCounts))
      } catch (e) {
        console.error("Error parsing highest token counts:", e)
      }
    }
  }, [])

  // Keep tokenCountsRef in sync with tokenCounts state
  useEffect(() => {
    tokenCountsRef.current = { ...tokenCounts }
  }, [tokenCounts])

  // Game loop using requestAnimationFrame
  useEffect(() => {
    if (gameState !== GameState.PLAYING) return

    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Game variables
    let animationFrameId: number
    let lineY = GAME_HEIGHT / 2
    let lineVelocity = 0
    let isAscending = false
    let gates: Gate[] = []
    let lastGateX = GAME_WIDTH // Track the x position of the last gate
    let gatesPassed = 0
    let currentScore = 0 // Track score within the game loop
    let baseSpeed = GATE_SPEED // Base speed that will increase with difficulty
    let currentSpeed = baseSpeed
    let activeEffects: TokenEffect[] = []
    let isGoldMode = false
    let flashingGates = false
    let btcEffectActive = false // Track if BTC effect is active
    let solEffectActive = false // Track if SOL effect is active
    let screenFlashTime = 0 // Track when the screen flash started
    let chaosMode = false // Track if BCH chaos mode is active
    let chaosModeEndTime = 0 // When chaos mode should end
    let lastTokenType = TokenType.NONE // Track the last token type spawned
    let difficultyLevel = 1 // Track the current difficulty level

    // Create a simple array to store the trail
    // Each index represents an x-coordinate, and the value represents the y-coordinate and direction
    const trail: TrailPoint[] = new Array(LINE_X_POSITION + 1).fill(null).map(() => ({
      y: lineY,
      isAscending: false,
    }))

    // Input handlers
    const handleInput = () => {
      // Use static bounce height
      lineVelocity = BOUNCE_VELOCITY
      isAscending = true
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault()
        handleInput()
      }
    }

    const handleClick = () => {
      handleInput()
    }

    // Add event listeners
    window.addEventListener("keydown", handleKeyDown)
    canvas.addEventListener("click", handleClick)

    // Function to get a random vertical variance for gates
    function getRandomVerticalVariance() {
      return MIN_VERTICAL_VARIANCE + Math.random() * (MAX_VERTICAL_VARIANCE - MIN_VERTICAL_VARIANCE)
    }

    // Function to get a random token type different from the last one
    function getRandomTokenType() {
      const tokenRoll = Math.random()
      let tokenType = TokenType.NONE

      // Create a pool of possible token types, excluding the last one
      const possibleTokens = []

      if (tokenRoll < 0.25) {
        // 25% chance for any token
        if (lastTokenType !== TokenType.BTC) possibleTokens.push(TokenType.BTC)
        if (lastTokenType !== TokenType.ETH) possibleTokens.push(TokenType.ETH)
        if (lastTokenType !== TokenType.TAO) possibleTokens.push(TokenType.TAO)
        if (lastTokenType !== TokenType.BCH) possibleTokens.push(TokenType.BCH)
        if (lastTokenType !== TokenType.HBAR) possibleTokens.push(TokenType.HBAR)
        if (lastTokenType !== TokenType.SOL) possibleTokens.push(TokenType.SOL)

        // If we have possible tokens, select one randomly
        if (possibleTokens.length > 0) {
          const randomIndex = Math.floor(Math.random() * possibleTokens.length)
          tokenType = possibleTokens[randomIndex]
        }
      }

      return tokenType
    }

    // Initialize with a gate at the right edge of the screen
    function initializeGate() {
      // Add vertical variance to make the game more challenging
      const verticalVariance = getRandomVerticalVariance()

      // Ensure the gate is still within playable bounds
      const minTopHeight = 50
      const maxTopHeight = GAME_HEIGHT - INITIAL_GATE_GAP - 100
      let topHeight = Math.random() * (maxTopHeight - minTopHeight) + minTopHeight

      // Apply vertical variance but ensure gate stays within bounds
      topHeight += verticalVariance
      topHeight = Math.max(minTopHeight, Math.min(maxTopHeight, topHeight))

      // Determine if this should be a narrow gate (30% chance)
      const isNarrowGate = Math.random() < 0.3
      const baseGateGap = isNarrowGate ? NARROW_GATE_GAP : INITIAL_GATE_GAP

      // Get a random token type different from the last one
      const tokenType = getRandomTokenType()
      lastTokenType = tokenType // Update the last token type

      gates.push({
        x: GAME_WIDTH,
        topHeight,
        hasPassed: false,
        tokenType,
        baseGateGap,
        isFlashing: false,
      })

      lastGateX = GAME_WIDTH
    }

    // Initialize the first gate
    initializeGate()

    // Game loop
    const gameLoop = (timestamp: number) => {
      // Clear canvas
      ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT)

      // Process active effects
      processEffects(timestamp)

      // Draw static trading chart background
      drawTradingChartBackground(ctx, isGoldMode)

      // Update line position
      if (!solEffectActive) {
        // Normal gravity if SOL effect is not active
        lineVelocity += GRAVITY
      }

      // Apply chaos mode if active
      if (chaosMode && timestamp < chaosModeEndTime) {
        // Apply random velocity changes
        lineVelocity += (Math.random() - 0.5) * 2 // Random value between -1 and 1

        // Add some visual indication of chaos
        ctx.fillStyle = "rgba(255, 0, 0, 0.1)"
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
      } else if (chaosMode && timestamp >= chaosModeEndTime) {
        // End chaos mode
        chaosMode = false
      }

      lineY += lineVelocity

      // Line changes color based on direction
      if (lineVelocity > 0) {
        isAscending = false
      } else {
        isAscending = true
      }

      // Shift all trail points to the left
      for (let i = 0; i < LINE_X_POSITION; i++) {
        trail[i] = trail[i + 1]
      }

      // Add the current position to the trail
      trail[LINE_X_POSITION] = {
        y: lineY,
        isAscending,
      }

      // Draw the trail - VERY EXPLICITLY
      for (let x = 0; x < LINE_X_POSITION; x++) {
        const point1 = trail[x]
        const point2 = trail[x + 1]

        if (point1 && point2) {
          // Set color based on whether the line was ascending or descending
          // If in gold mode, make the trail gold
          // If SOL effect is active, make the trail purple
          let trailColor = point2.isAscending ? "#26a69a" : "#ef5350"
          if (isGoldMode) {
            trailColor = "#FFD700"
          } else if (solEffectActive) {
            trailColor = "#9945FF" // Solana purple
          }

          ctx.strokeStyle = trailColor
          ctx.lineWidth = 3

          // Draw a line segment
          ctx.beginPath()
          ctx.moveTo(x, point1.y)
          ctx.lineTo(x + 1, point2.y)
          ctx.stroke()
        }
      }

      // Check if we need to spawn a new gate (when the last gate has moved in by GATE_DISTANCE)
      if (lastGateX <= GAME_WIDTH - GATE_DISTANCE) {
        // Add vertical variance to make the game more challenging
        const verticalVariance = getRandomVerticalVariance()

        // Ensure the gate is still within playable bounds
        const minTopHeight = 50
        const maxTopHeight = GAME_HEIGHT - INITIAL_GATE_GAP - 100
        let topHeight = Math.random() * (maxTopHeight - minTopHeight) + minTopHeight

        // Apply vertical variance but ensure gate stays within bounds
        topHeight += verticalVariance
        topHeight = Math.max(minTopHeight, Math.min(maxTopHeight, topHeight))

        // Determine if this should be a narrow gate (30% chance)
        const isNarrowGate = Math.random() < 0.3
        const baseGateGap = isNarrowGate ? NARROW_GATE_GAP : INITIAL_GATE_GAP

        // Get a random token type different from the last one
        const tokenType = getRandomTokenType()
        lastTokenType = tokenType // Update the last token type

        gates.push({
          x: GAME_WIDTH,
          topHeight,
          hasPassed: false,
          tokenType,
          baseGateGap,
          isFlashing: false,
        })

        lastGateX = GAME_WIDTH
      }

      // Update and draw gates
      gates = gates.filter((gate) => {
        gate.x -= currentSpeed

        // Update the last gate position if this is the rightmost gate
        if (gate.x > lastGateX - GATE_WIDTH) {
          lastGateX = gate.x
        }

        // Update flashing state if needed
        if (flashingGates) {
          gate.isFlashing = Math.floor(timestamp / 200) % 2 === 0 // Flash every 200ms
        } else {
          gate.isFlashing = false
        }

        // Calculate actual gate gap based on effects
        let actualGateGap = gate.baseGateGap
        if (btcEffectActive) {
          actualGateGap = gate.baseGateGap * (1 + GATE_GAP_INCREASE_PERCENT / 100)
        }

        // Check if line is currently interacting with this gate
        const gateLeftX = gate.x
        const gateRightX = gate.x + GATE_WIDTH

        // Check if any part of the gate overlaps with the line's x position
        if (gateLeftX <= LINE_X_POSITION && gateRightX >= LINE_X_POSITION) {
          // Check collision with top and bottom gates
          let collision = false

          // If SOL effect is active, no collision
          if (!solEffectActive) {
            // Check if the current pencil tip collides with gates
            // Top gate collision
            if (lineY <= gate.topHeight) {
              collision = true
            }

            // Bottom gate collision
            if (lineY >= gate.topHeight + actualGateGap) {
              collision = true
            }
          }

          if (collision) {
            setGameState(GameState.GAME_OVER)
            // Update high score if current score is higher
            if (currentScore > highScore) {
              setHighScore(currentScore)
              localStorage.setItem("btcGameHighScore", currentScore.toString())
            }

            // Update highest token counts if current counts are higher
            const newHighestCounts = { ...highestTokenCounts }
            let countsUpdated = false

            Object.keys(tokenCountsRef.current).forEach((token) => {
              const tokenType = token as TokenType
              if (tokenCountsRef.current[tokenType] > newHighestCounts[tokenType]) {
                newHighestCounts[tokenType] = tokenCountsRef.current[tokenType]
                countsUpdated = true
              }
            })

            if (countsUpdated) {
              setHighestTokenCounts(newHighestCounts)
              localStorage.setItem("btcGameHighestTokenCounts", JSON.stringify(newHighestCounts))
            }

            // Sync token counts with state before game over
            setTokenCounts({ ...tokenCountsRef.current })
            return false
          }

          // Check if token was collected
          if (gate.tokenType !== TokenType.NONE) {
            const tokenY = gate.topHeight + actualGateGap / 2
            if (Math.abs(lineY - tokenY) < TOKEN_COLLECTION_RADIUS) {
              // Apply token effect
              applyTokenEffect(gate.tokenType, timestamp)

              // Trigger screen flash
              screenFlashTime = timestamp

              // Update token count in ref
              const tokenType = gate.tokenType
              tokenCountsRef.current = {
                ...tokenCountsRef.current,
                [tokenType]: tokenCountsRef.current[tokenType] + 1,
              }

              // Log token collection for debugging
              console.log(`Collected ${gate.tokenType}, count: ${tokenCountsRef.current[tokenType]}`)

              // Update token counts in state immediately
              setTokenCounts((prevCounts) => ({
                ...prevCounts,
                [tokenType]: prevCounts[tokenType] + 1,
              }))

              // If it's BCH, activate chaos mode
              if (gate.tokenType === TokenType.BCH) {
                chaosMode = true
                chaosModeEndTime = timestamp + BCH_CHAOS_DURATION
              }

              // Remove the token
              gate.tokenType = TokenType.NONE
            }
          }
        }

        // Check if gate has been passed
        if (!gate.hasPassed && gate.x + GATE_WIDTH < LINE_X_POSITION) {
          gate.hasPassed = true
          gatesPassed++
          currentScore = gatesPassed
          setScore(currentScore) // Update score in state immediately

          // Check if we need to increase difficulty
          if (gatesPassed % DIFFICULTY_GATE_THRESHOLD === 0) {
            difficultyLevel++
            baseSpeed = GATE_SPEED * (1 + (difficultyLevel - 1) * DIFFICULTY_INCREASE)
            console.log(`Difficulty increased to level ${difficultyLevel}, speed: ${baseSpeed.toFixed(2)}`)
          }
        }

        // Draw gates with the actual gap
        if (gate.x + GATE_WIDTH > 0) {
          drawGate(ctx, gate, actualGateGap, isGoldMode, solEffectActive)

          // Draw token if this gate has one
          if (gate.tokenType !== TokenType.NONE) {
            const tokenY = gate.topHeight + actualGateGap / 2
            drawToken(ctx, gate.x + GATE_WIDTH / 2, tokenY, gate.tokenType)
          }

          return true
        }

        return false
      })

      // Draw the current position indicator (the rocket)
      drawCurrentPosition(ctx, lineY, isAscending, isGoldMode, solEffectActive)

      // Draw token counters
      drawTokenCounters(ctx, tokenCountsRef.current, highestTokenCounts)

      // Draw BUY/SELL indicators
      drawBuySellIndicators(ctx, isAscending)

      // Draw screen flash if active
      if (timestamp - screenFlashTime < SCREEN_FLASH_DURATION) {
        const flashProgress = (timestamp - screenFlashTime) / SCREEN_FLASH_DURATION
        const opacity = 1 - flashProgress
        ctx.fillStyle = `rgba(255, 255, 255, ${opacity * 0.7})`
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
      }

      // Check game over conditions
      if (lineY < 0 || lineY > GAME_HEIGHT) {
        setGameState(GameState.GAME_OVER)
        // Update high score if current score is higher
        if (currentScore > highScore) {
          setHighScore(currentScore)
          localStorage.setItem("btcGameHighScore", currentScore.toString())
        }

        // Update highest token counts if current counts are higher
        const newHighestCounts = { ...highestTokenCounts }
        let countsUpdated = false

        Object.keys(tokenCountsRef.current).forEach((token) => {
          const tokenType = token as TokenType
          if (tokenCountsRef.current[tokenType] > newHighestCounts[tokenType]) {
            newHighestCounts[tokenType] = tokenCountsRef.current[tokenType]
            countsUpdated = true
          }
        })

        if (countsUpdated) {
          setHighestTokenCounts(newHighestCounts)
          localStorage.setItem("btcGameHighestTokenCounts", JSON.stringify(newHighestCounts))
        }

        // Sync token counts with state before game over
        setTokenCounts({ ...tokenCountsRef.current })
        return
      }

      // Continue game loop
      animationFrameId = requestAnimationFrame(gameLoop)

      // Function to process active effects
      function processEffects(timestamp: number) {
        // Remove expired effects
        activeEffects = activeEffects.filter((effect) => effect.endTime > timestamp)

        // Reset effect states
        currentSpeed = baseSpeed
        isGoldMode = false
        flashingGates = false
        btcEffectActive = false
        solEffectActive = false

        // Apply active effects
        for (const effect of activeEffects) {
          switch (effect.type) {
            case TokenType.ETH:
              currentSpeed = baseSpeed * 0.5 // 50% slower
              break
            case TokenType.TAO:
              flashingGates = true
              break
            case TokenType.HBAR:
              isGoldMode = true
              break
            case TokenType.BTC:
              btcEffectActive = true // Set BTC effect active
              currentSpeed = baseSpeed * BTC_SPEED_BOOST // 10% faster with BTC
              break
            case TokenType.SOL:
              solEffectActive = true // Set SOL effect active
              currentSpeed = baseSpeed * SOL_SPEED_BOOST // 100% faster with SOL
              // Make the rocket go straight (zero gravity)
              lineVelocity = 0
              break
          }
        }
      }

      // Function to apply token effects
      function applyTokenEffect(tokenType: TokenType, timestamp: number) {
        switch (tokenType) {
          case TokenType.BTC:
            // Bitcoin: Wider gates for exactly 10 seconds
            activeEffects.push({
              type: TokenType.BTC,
              endTime: timestamp + 10000, // Fixed 10 seconds
            })
            break
          case TokenType.ETH:
            // ETH: Slow game for 5 seconds
            activeEffects.push({
              type: TokenType.ETH,
              endTime: timestamp + 5000,
            })
            break
          case TokenType.TAO:
            // TAO: Flashing gates for 5 seconds
            activeEffects.push({
              type: TokenType.TAO,
              endTime: timestamp + 5000,
            })
            break
          case TokenType.HBAR:
            // HBAR: Gold mode for 10 seconds
            activeEffects.push({
              type: TokenType.HBAR,
              endTime: timestamp + 10000,
            })
            break
          case TokenType.BCH:
            // BCH: Chaos mode for 3 seconds (handled in main code)
            break
          case TokenType.SOL:
            // SOL: Straight line and transparent gates for 5 seconds
            activeEffects.push({
              type: TokenType.SOL,
              endTime: timestamp + SOL_EFFECT_DURATION,
            })
            break
        }
      }
    }

    // Start game loop
    animationFrameId = requestAnimationFrame(gameLoop)

    // Cleanup
    return () => {
      cancelAnimationFrame(animationFrameId)
      window.removeEventListener("keydown", handleKeyDown)
      canvas.removeEventListener("click", handleClick)
    }
  }, [gameState, highScore, highestTokenCounts])

  // Drawing functions
  const drawTradingChartBackground = (ctx: CanvasRenderingContext2D, isGoldMode: boolean) => {
    // Draw white background (changed from dark)
    ctx.fillStyle = isGoldMode ? "#fffbeb" : "#ffffff"
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)

    // Draw grid lines with lighter colors for white background
    ctx.strokeStyle = isGoldMode ? "#e6d58d" : "#e0e0e0"
    ctx.lineWidth = 1

    // Horizontal grid lines
    for (let y = 0; y < GAME_HEIGHT; y += 50) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(GAME_WIDTH, y)
      ctx.stroke()
    }

    // Vertical grid lines
    for (let x = 0; x < GAME_WIDTH; x += 100) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, GAME_HEIGHT)
      ctx.stroke()
    }

    // Draw static price indicators on the y-axis with darker text for white background
    ctx.fillStyle = isGoldMode ? "#b59a00" : "#666666"
    ctx.font = "12px Arial"
    for (let y = 50; y < GAME_HEIGHT; y += 50) {
      const price = 50000 - (y / GAME_HEIGHT) * 40000
      ctx.fillText(`$${Math.round(price).toLocaleString()}`, 5, y - 5)
    }
  }

  const drawCurrentPosition = (
    ctx: CanvasRenderingContext2D,
    y: number,
    isAscending: boolean,
    isGoldMode: boolean,
    solEffectActive: boolean,
  ) => {
    // Draw the rocket emoji instead of a circle
    ctx.font = "24px Arial"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"

    // Determine the rotation based on direction
    // If SOL effect is active, keep rocket straight
    const rotation = solEffectActive ? 0 : isAscending ? -0.3 : 0.3

    // Save the current context state
    ctx.save()

    // Translate to the rocket position, rotate, then draw
    ctx.translate(LINE_X_POSITION, y)
    ctx.rotate(rotation)

    // Draw the rocket emoji
    ctx.fillText("🚀", 0, 0)

    // If SOL effect is active, add a purple glow
    if (solEffectActive) {
      ctx.shadowColor = "#9945FF"
      ctx.shadowBlur = 10
      ctx.fillText("🚀", 0, 0)
      ctx.shadowBlur = 0
    }

    // Restore the context to its original state
    ctx.restore()
  }

  const drawBuySellIndicators = (ctx: CanvasRenderingContext2D, isAscending: boolean) => {
    const boxWidth = 60
    const boxHeight = 40
    const margin = 20
    const bottomMargin = 80

    // Draw BUY box (green)
    const buyBoxX = margin
    const buyBoxY = GAME_HEIGHT - bottomMargin

    // Determine if BUY box should be illuminated
    const buyBoxColor = isAscending ? "#26a69a" : "#a8d5d1" // Bright green when active, pale green when inactive

    ctx.fillStyle = buyBoxColor
    ctx.fillRect(buyBoxX, buyBoxY, boxWidth, boxHeight)
    ctx.strokeStyle = "#000000"
    ctx.lineWidth = 2
    ctx.strokeRect(buyBoxX, buyBoxY, boxWidth, boxHeight)

    // Draw BUY text
    ctx.fillStyle = "#ffffff"
    ctx.font = "bold 16px Arial"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText("BUY", buyBoxX + boxWidth / 2, buyBoxY + boxHeight / 2)

    // Draw SELL box (red)
    const sellBoxX = buyBoxX + boxWidth + margin
    const sellBoxY = buyBoxY

    // Determine if SELL box should be illuminated
    const sellBoxColor = !isAscending ? "#ef5350" : "#f5b5b3" // Bright red when active, pale red when inactive

    ctx.fillStyle = sellBoxColor
    ctx.fillRect(sellBoxX, sellBoxY, boxWidth, boxHeight)
    ctx.strokeStyle = "#000000"
    ctx.lineWidth = 2
    ctx.strokeRect(sellBoxX, sellBoxY, boxWidth, boxHeight)

    // Draw SELL text
    ctx.fillStyle = "#ffffff"
    ctx.font = "bold 16px Arial"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText("SELL", sellBoxX + boxWidth / 2, sellBoxY + boxHeight / 2)
  }

  const drawGate = (
    ctx: CanvasRenderingContext2D,
    gate: Gate,
    actualGateGap: number,
    isGoldMode: boolean,
    solEffectActive: boolean,
  ) => {
    // Determine colors based on mode and flashing
    let topColor = "#ef5350"
    let bottomColor = "#26a69a"

    if (isGoldMode) {
      topColor = "#FFD700"
      bottomColor = "#FFD700"
    } else if (gate.isFlashing) {
      // Invert colors when flashing
      topColor = "#26a69a"
      bottomColor = "#ef5350"
    }

    // Set transparency if SOL effect is active
    const alpha = solEffectActive ? 0.3 : 1.0
    const topColorWithAlpha = solEffectActive ? topColor + "4D" : topColor // 30% opacity
    const bottomColorWithAlpha = solEffectActive ? bottomColor + "4D" : bottomColor // 30% opacity

    // Draw top gate (bear)
    ctx.fillStyle = topColorWithAlpha
    ctx.fillRect(gate.x, 0, GATE_WIDTH, gate.topHeight)

    // Draw bear icon on top gate
    ctx.fillStyle = solEffectActive ? "rgba(255, 255, 255, 0.3)" : "#ffffff"
    ctx.font = "20px Arial"
    ctx.fillText("🐻", gate.x + GATE_WIDTH / 2 - 10, gate.topHeight - 20)

    // Draw bottom gate (bull)
    ctx.fillStyle = bottomColorWithAlpha
    ctx.fillRect(gate.x, gate.topHeight + actualGateGap, GATE_WIDTH, GAME_HEIGHT - (gate.topHeight + actualGateGap))

    // Draw bull icon on bottom gate
    ctx.fillStyle = solEffectActive ? "rgba(255, 255, 255, 0.3)" : "#ffffff"
    ctx.font = "20px Arial"
    ctx.fillText("🐂", gate.x + GATE_WIDTH / 2 - 10, gate.topHeight + actualGateGap + 30)

    // Draw candle-like appearance for bottom gate
    ctx.fillStyle = bottomColorWithAlpha
    ctx.fillRect(gate.x + GATE_WIDTH / 2 - 5, gate.topHeight + actualGateGap - 20, 10, 20)
  }

  const drawToken = (ctx: CanvasRenderingContext2D, x: number, y: number, tokenType: TokenType) => {
    switch (tokenType) {
      case TokenType.BTC:
        // Draw Bitcoin
        ctx.fillStyle = "#f7931a"
        ctx.beginPath()
        ctx.arc(x, y, 25, 0, Math.PI * 2)
        ctx.fill()

        // Draw Bitcoin symbol
        ctx.fillStyle = "#ffffff"
        ctx.font = "30px Arial"
        ctx.fillText("₿", x - 10, y + 10)
        break

      case TokenType.ETH:
        // Draw Ethereum
        ctx.fillStyle = "#627eea"
        ctx.beginPath()
        ctx.arc(x, y, 25, 0, Math.PI * 2)
        ctx.fill()

        // Draw Ethereum symbol
        ctx.fillStyle = "#ffffff"
        ctx.font = "30px Arial"
        ctx.fillText("Ξ", x - 10, y + 10)
        break

      case TokenType.TAO:
        // Draw TAO (custom icon)
        ctx.fillStyle = "#1a1a1a"
        ctx.beginPath()
        ctx.arc(x, y, 25, 0, Math.PI * 2)
        ctx.fill()

        // Draw TAO symbol (custom hexagon with T)
        ctx.fillStyle = "#ffffff"

        // Draw hexagon
        const hexSize = 15
        ctx.beginPath()
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i
          const hx = x + hexSize * Math.cos(angle)
          const hy = y + hexSize * Math.sin(angle)
          if (i === 0) ctx.moveTo(hx, hy)
          else ctx.lineTo(hx, hy)
        }
        ctx.closePath()
        ctx.strokeStyle = "#ffffff"
        ctx.lineWidth = 2
        ctx.stroke()

        // Draw T
        ctx.fillRect(x - 8, y - 8, 16, 3)
        ctx.fillRect(x, y - 8, 3, 16)
        break

      case TokenType.BCH:
        // Draw Bitcoin Cash (improved logo)
        ctx.fillStyle = "#8dc351"
        ctx.beginPath()
        ctx.arc(x, y, 25, 0, Math.PI * 2)
        ctx.fill()

        // Draw BCH symbol (more accurate to actual logo)
        ctx.fillStyle = "#ffffff"

        // Save context for rotation
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(Math.PI / 12) // Slight rotation for the BCH logo

        // Draw the B shape
        ctx.beginPath()
        ctx.moveTo(-10, -12)
        ctx.lineTo(-10, 12)
        ctx.lineWidth = 3
        ctx.strokeStyle = "#ffffff"
        ctx.stroke()

        // Draw the two horizontal lines
        ctx.beginPath()
        ctx.moveTo(-10, -6)
        ctx.lineTo(10, -6)
        ctx.stroke()

        ctx.beginPath()
        ctx.moveTo(-10, 6)
        ctx.lineTo(10, 6)
        ctx.stroke()

        // Draw the curved parts of B
        ctx.beginPath()
        ctx.arc(-5, -9, 5, Math.PI * 1.5, Math.PI * 0.5, false)
        ctx.stroke()

        ctx.beginPath()
        ctx.arc(-5, 3, 5, Math.PI * 1.5, Math.PI * 0.5, false)
        ctx.stroke()

        // Restore context
        ctx.restore()
        break

      case TokenType.HBAR:
        // Draw HBAR (improved logo)
        ctx.fillStyle = "#222222" // Hedera uses a dark background
        ctx.beginPath()
        ctx.arc(x, y, 25, 0, Math.PI * 2)
        ctx.fill()

        // Draw HBAR symbol (more accurate to actual logo)
        ctx.strokeStyle = "#00baff"
        ctx.lineWidth = 3

        // Draw the stylized 'h' of Hedera
        ctx.beginPath()
        // Left vertical line
        ctx.moveTo(x - 10, y - 10)
        ctx.lineTo(x - 10, y + 10)

        // Right vertical line
        ctx.moveTo(x + 10, y - 10)
        ctx.lineTo(x + 10, y + 10)

        // Horizontal connecting line
        ctx.moveTo(x - 10, y)
        ctx.lineTo(x + 10, y)

        // Horizontal bar through (distinctive feature of HBAR logo)
        ctx.moveTo(x - 15, y - 5)
        ctx.lineTo(x + 15, y - 5)

        ctx.stroke()
        break

      case TokenType.SOL:
        // Draw Solana
        ctx.fillStyle = "#9945FF" // Solana purple
        ctx.beginPath()
        ctx.arc(x, y, 25, 0, Math.PI * 2)
        ctx.fill()

        // Draw Solana symbol (simplified 'S')
        ctx.fillStyle = "#ffffff"
        ctx.font = "bold 30px Arial"
        ctx.fillText("S", x - 9, y + 10)

        // Add a glow effect
        ctx.shadowColor = "#9945FF"
        ctx.shadowBlur = 15
        ctx.beginPath()
        ctx.arc(x, y, 27, 0, Math.PI * 2)
        ctx.strokeStyle = "#ffffff"
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.shadowBlur = 0
        break
    }
  }

  const drawTokenCounters = (ctx: CanvasRenderingContext2D, counts: TokenCounts, highestCounts: TokenCounts) => {
    // Draw token counters horizontally in the top right corner
    const startY = 30
    const iconSize = 15
    const spacing = 60 // Horizontal spacing between icons
    const textOffset = 25 // Space between icon and text (increased for better visibility)

    ctx.font = "bold 16px Arial" // Make font bold for better visibility
    ctx.textAlign = "left"

    // Calculate starting X position to align right
    let startX = GAME_WIDTH - 20 - spacing * 5 // 20px padding from right edge, now with 6 tokens

    // BTC counter
    ctx.fillStyle = "#f7931a"
    ctx.beginPath()
    ctx.arc(startX, startY, iconSize, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = "#ffffff"
    ctx.fillText("₿", startX - 5, startY + 5)

    // Draw count with background for better visibility
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)"
    ctx.fillRect(startX + 15, startY - 10, 40, 20)
    ctx.fillStyle = "#000000" // Black text
    ctx.fillText(`${counts[TokenType.BTC]}/${highestCounts[TokenType.BTC]}`, startX + textOffset, startY + 5)

    // ETH counter
    startX += spacing
    ctx.fillStyle = "#627eea"
    ctx.beginPath()
    ctx.arc(startX, startY, iconSize, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = "#ffffff"
    ctx.fillText("Ξ", startX - 5, startY + 5)

    // Draw count with background
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)"
    ctx.fillRect(startX + 15, startY - 10, 40, 20)
    ctx.fillStyle = "#000000"
    ctx.fillText(`${counts[TokenType.ETH]}/${highestCounts[TokenType.ETH]}`, startX + textOffset, startY + 5)

    // TAO counter
    startX += spacing
    ctx.fillStyle = "#1a1a1a"
    ctx.beginPath()
    ctx.arc(startX, startY, iconSize, 0, Math.PI * 2)
    ctx.fill()

    // Draw TAO hexagon icon
    ctx.strokeStyle = "#ffffff"
    ctx.lineWidth = 1.5
    const hexSize = 7
    ctx.beginPath()
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i
      const hx = startX + hexSize * Math.cos(angle)
      const hy = startY + hexSize * Math.sin(angle)
      if (i === 0) ctx.moveTo(hx, hy)
      else ctx.lineTo(hx, hy)
    }
    ctx.closePath()
    ctx.stroke()

    // Draw T
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(startX - 4, startY - 4, 8, 1.5)
    ctx.fillRect(startX, startY - 4, 1.5, 8)

    // Draw count with background
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)"
    ctx.fillRect(startX + 15, startY - 10, 40, 20)
    ctx.fillStyle = "#000000"
    ctx.fillText(`${counts[TokenType.TAO]}/${highestCounts[TokenType.TAO]}`, startX + textOffset, startY + 5)

    // BCH counter
    startX += spacing
    ctx.fillStyle = "#8dc351"
    ctx.beginPath()
    ctx.arc(startX, startY, iconSize, 0, Math.PI * 2)
    ctx.fill()

    // Draw BCH symbol
    ctx.fillStyle = "#ffffff"
    ctx.save()
    ctx.translate(startX, startY)
    ctx.rotate(Math.PI / 12)

    // Draw the B shape
    ctx.beginPath()
    ctx.moveTo(-5, -6)
    ctx.lineTo(-5, 6)
    ctx.lineWidth = 1.5
    ctx.strokeStyle = "#ffffff"
    ctx.stroke()

    // Draw the two horizontal lines
    ctx.beginPath()
    ctx.moveTo(-5, -3)
    ctx.lineTo(5, -3)
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(-5, 3)
    ctx.lineTo(5, 3)
    ctx.stroke()

    // Draw the curved parts of B
    ctx.beginPath()
    ctx.arc(-2.5, -4.5, 2.5, Math.PI * 1.5, Math.PI * 0.5, false)
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(-2.5, 1.5, 2.5, Math.PI * 1.5, Math.PI * 0.5, false)
    ctx.stroke()

    ctx.restore()

    // Draw count with background
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)"
    ctx.fillRect(startX + 15, startY - 10, 40, 20)
    ctx.fillStyle = "#000000"
    ctx.fillText(`${counts[TokenType.BCH]}/${highestCounts[TokenType.BCH]}`, startX + textOffset, startY + 5)

    // HBAR counter
    startX += spacing
    ctx.fillStyle = "#222222"
    ctx.beginPath()
    ctx.arc(startX, startY, iconSize, 0, Math.PI * 2)
    ctx.fill()

    // Draw HBAR symbol
    ctx.strokeStyle = "#00baff"
    ctx.lineWidth = 1.5

    // Draw the stylized 'h' of Hedera
    ctx.beginPath()
    // Left vertical line
    ctx.moveTo(startX - 5, startY - 5)
    ctx.lineTo(startX - 5, startY + 5)

    // Right vertical line
    ctx.moveTo(startX + 5, startY - 5)
    ctx.lineTo(startX + 5, startY + 5)

    // Horizontal connecting line
    ctx.moveTo(startX - 5, startY)
    ctx.lineTo(startX + 5, startY)

    // Horizontal bar through (distinctive feature of HBAR logo)
    ctx.moveTo(startX - 7, startY - 2.5)
    ctx.lineTo(startX + 7, startY - 2.5)

    ctx.stroke()

    // Draw count with background
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)"
    ctx.fillRect(startX + 15, startY - 10, 40, 20)
    ctx.fillStyle = "#000000"
    ctx.fillText(`${counts[TokenType.HBAR]}/${highestCounts[TokenType.HBAR]}`, startX + textOffset, startY + 5)

    // SOL counter
    startX += spacing
    ctx.fillStyle = "#9945FF" // Solana purple
    ctx.beginPath()
    ctx.arc(startX, startY, iconSize, 0, Math.PI * 2)
    ctx.fill()

    // Draw SOL symbol
    ctx.fillStyle = "#ffffff"
    ctx.font = "bold 16px Arial"
    ctx.fillText("S", startX - 5, startY + 5)

    // Draw count with background
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)"
    ctx.fillRect(startX + 15, startY - 10, 40, 20)
    ctx.fillStyle = "#000000"
    ctx.fillText(`${counts[TokenType.SOL]}/${highestCounts[TokenType.SOL]}`, startX + textOffset, startY + 5)
  }

  // Start game handler
  const handleStartGame = () => {
    setGameState(GameState.PLAYING)
    setScore(0)
    const resetCounts = {
      [TokenType.BTC]: 0,
      [TokenType.ETH]: 0,
      [TokenType.TAO]: 0,
      [TokenType.BCH]: 0,
      [TokenType.HBAR]: 0,
      [TokenType.SOL]: 0,
    }
    setTokenCounts(resetCounts)
    tokenCountsRef.current = { ...resetCounts }
  }

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={GAME_WIDTH}
          height={GAME_HEIGHT}
          className={cn(
            "border-2 border-gray-700 rounded-lg shadow-lg",
            gameState === GameState.PLAYING ? "cursor-pointer" : "",
          )}
        />

        {gameState === GameState.START && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80">
            <h1 className="text-4xl font-bold text-gray-800 mb-4">BTC Trading Game</h1>
            <p className="text-gray-700 mb-8 text-center max-w-md">
              Navigate through the bull and bear gates by clicking or pressing space.
              <br />
              Collect crypto tokens for special effects!
            </p>
            <Button onClick={handleStartGame} size="lg" className="bg-yellow-500 hover:bg-yellow-600">
              Start Game
            </Button>
          </div>
        )}

        {gameState === GameState.GAME_OVER && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80">
            <h1 className="text-4xl font-bold text-gray-800 mb-4">Game Over</h1>
            <p className="text-2xl text-gray-700 mb-2">Score: {score}</p>
            <p className="text-xl text-gray-700 mb-4">High Score: {highScore}</p>

            <div className="flex gap-4 mb-6 flex-wrap justify-center max-w-md">
              <div className="text-center">
                <div className="bg-[#f7931a] rounded-full w-10 h-10 flex items-center justify-center mx-auto">
                  <span className="text-white text-xl">₿</span>
                </div>
                <p className="text-gray-700 mt-1">
                  {tokenCounts[TokenType.BTC]}/{highestTokenCounts[TokenType.BTC]}
                </p>
              </div>
              <div className="text-center">
                <div className="bg-[#627eea] rounded-full w-10 h-10 flex items-center justify-center mx-auto">
                  <span className="text-white text-xl">Ξ</span>
                </div>
                <p className="text-gray-700 mt-1">
                  {tokenCounts[TokenType.ETH]}/{highestTokenCounts[TokenType.ETH]}
                </p>
              </div>
              <div className="text-center">
                <div className="bg-[#1a1a1a] rounded-full w-10 h-10 flex items-center justify-center mx-auto">
                  <div className="relative">
                    {/* TAO hexagon icon */}
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M10 2L17.3 6.5V15.5L10 20L2.7 15.5V6.5L10 2Z" stroke="white" strokeWidth="1.5" />
                      <path d="M6 8H14M10 8V16" stroke="white" strokeWidth="1.5" />
                    </svg>
                  </div>
                </div>
                <p className="text-gray-700 mt-1">
                  {tokenCounts[TokenType.TAO]}/{highestTokenCounts[TokenType.TAO]}
                </p>
              </div>
              <div className="text-center">
                <div className="bg-[#8dc351] rounded-full w-10 h-10 flex items-center justify-center mx-auto">
                  <div className="relative">
                    {/* BCH icon - improved */}
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <g transform="translate(10, 10) rotate(15) translate(-10, -10)">
                        <path d="M6 4V16" stroke="white" strokeWidth="1.5" />
                        <path d="M6 7H14" stroke="white" strokeWidth="1.5" />
                        <path d="M6 13H14" stroke="white" strokeWidth="1.5" />
                        <path d="M6 7C10 7 10 13 6 13" stroke="white" strokeWidth="1.5" fill="none" />
                      </g>
                    </svg>
                  </div>
                </div>
                <p className="text-gray-700 mt-1">
                  {tokenCounts[TokenType.BCH]}/{highestTokenCounts[TokenType.BCH]}
                </p>
              </div>
              <div className="text-center">
                <div className="bg-[#222222] rounded-full w-10 h-10 flex items-center justify-center mx-auto">
                  <div className="relative">
                    {/* HBAR icon - improved */}
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M5 4V16M15 4V16M5 10H15M3 7H17" stroke="#00baff" strokeWidth="1.5" />
                    </svg>
                  </div>
                </div>
                <p className="text-gray-700 mt-1">
                  {tokenCounts[TokenType.HBAR]}/{highestTokenCounts[TokenType.HBAR]}
                </p>
              </div>
              <div className="text-center">
                <div className="bg-[#9945FF] rounded-full w-10 h-10 flex items-center justify-center mx-auto">
                  <div className="relative">
                    {/* SOL icon */}
                    <span className="text-white font-bold text-lg">S</span>
                  </div>
                </div>
                <p className="text-gray-700 mt-1">
                  {tokenCounts[TokenType.SOL]}/{highestTokenCounts[TokenType.SOL]}
                </p>
              </div>
            </div>

            <Button onClick={handleStartGame} size="lg" className="bg-yellow-500 hover:bg-yellow-600">
              Play Again
            </Button>
          </div>
        )}

        {gameState === GameState.PLAYING && (
          <div className="absolute top-4 left-4 bg-white/70 px-4 py-2 rounded-lg border border-gray-300">
            <p className="text-gray-800 text-xl font-bold">Score: {score}</p>
            <p className="text-gray-600 text-sm">High Score: {highScore}</p>
          </div>
        )}

        <div className="absolute bottom-4 right-4 bg-white/70 px-4 py-2 rounded-lg border border-gray-300">
          <p className="text-gray-800">
            <span className="mr-2">Controls:</span>
            <span className="inline-flex items-center mr-2">
              <kbd className="px-2 py-1 bg-gray-200 border border-gray-400 rounded text-xs mr-1">Space</kbd>
              or
              <span className="ml-1">Click</span>
            </span>
          </p>
        </div>
      </div>
    </div>
  )
}
