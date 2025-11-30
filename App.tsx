import React, { useState, useEffect, useRef } from 'react';
import { 
  Trophy, Key, RefreshCw, Archive, Sparkles, X, 
  Play, RotateCcw, Zap, Hand
} from 'lucide-react';
import confetti from 'canvas-confetti';

// Project imports
import { 
  Grid, Shape
} from './types';
import { 
  GRID_SIZE, COST_ROTATE, 
  createEmptyGrid, generateRandomShape 
} from './constants';
import { 
  canPlacePiece, placePiece, checkLines, checkGameOver, rotateMatrix, calculateScore 
} from './services/gameLogic';
import { getAIHint } from './services/geminiService';

// Components
import { GridCell } from './components/GridCell';
import { PieceView } from './components/PieceView';

type GamePhase = 'start' | 'playing' | 'gameover';

interface DragState {
  active: boolean;
  piece: Shape;
  sourceIndex: number | 'hold'; // Index in availablePieces or 'hold'
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  touchOffset: { x: number, y: number }; // Offset from top-left of the piece element
}

const App: React.FC = () => {
  // --- State ---
  const [phase, setPhase] = useState<GamePhase>('start');
  const [grid, setGrid] = useState<Grid>(createEmptyGrid());
  const [availablePieces, setAvailablePieces] = useState<Shape[]>([]);
  const [holdPiece, setHoldPiece] = useState<Shape | null>(null);
  const [selectedPieceIndex, setSelectedPieceIndex] = useState<number | null>(null); // Kept for tap-to-select logic
  
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [keys, setKeys] = useState(0);
  const [combo, setCombo] = useState(1);
  
  const [aiHint, setAiHint] = useState<string | null>(null);
  const [isLoadingHint, setIsLoadingHint] = useState(false);

  // Drag & Drop State
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dropPreview, setDropPreview] = useState<{ x: number, y: number } | null>(null);
  const [isHoveringHold, setIsHoveringHold] = useState(false);

  // Refs for coordinate calculations
  const gridRef = useRef<HTMLDivElement>(null);
  const holdRef = useRef<HTMLButtonElement>(null);

  // --- Initialization ---
  useEffect(() => {
    const stored = localStorage.getItem('qblock_highscore');
    if (stored) setHighScore(parseInt(stored));
  }, []);

  const startGame = () => {
    setGrid(createEmptyGrid());
    setScore(0);
    setKeys(3); // Start with 3 bonus keys
    setCombo(1);
    setHoldPiece(null);
    setAiHint(null);
    spawnPieces();
    setPhase('playing');
  };

  const spawnPieces = () => {
    const newPieces = [generateRandomShape(), generateRandomShape(), generateRandomShape()];
    setAvailablePieces(newPieces);
    setSelectedPieceIndex(null);
    
    // Check game over immediately after spawn
    setTimeout(() => {
      if (checkGameOver(grid, newPieces, holdPiece)) {
        setPhase('gameover');
      }
    }, 100);
  };

  // --- Haptics Helper ---
  const triggerHaptic = (type: 'light' | 'medium' | 'heavy' | 'success') => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      switch (type) {
        case 'light': navigator.vibrate(10); break;
        case 'medium': navigator.vibrate(30); break;
        case 'heavy': navigator.vibrate(50); break;
        case 'success': navigator.vibrate([30, 50, 30]); break;
      }
    }
  };

  // --- Drag & Drop Logic ---

  const handleDragStart = (e: React.PointerEvent, piece: Shape, sourceIndex: number | 'hold') => {
    if (phase !== 'playing') return;
    
    // Allow selecting without dragging if just a tap, but start drag tracking
    e.preventDefault(); // Prevent scroll
    
    // Get element dimensions to center the drag or use offset
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    
    // Determine offset so the piece stays relative to finger
    // We lift it up slightly (y offset) so the finger doesn't cover it
    const touchOffset = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };

    setDragState({
      active: true,
      piece: JSON.parse(JSON.stringify(piece)), // Deep copy to avoid mutating source during render
      sourceIndex,
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
      touchOffset
    });

    // Select it as well for rotation buttons to work
    if (typeof sourceIndex === 'number') {
      setSelectedPieceIndex(sourceIndex);
    } else {
      setSelectedPieceIndex(null);
    }

    triggerHaptic('light');
  };

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!dragState?.active) return;
      e.preventDefault();

      setDragState(prev => prev ? ({
        ...prev,
        currentX: e.clientX,
        currentY: e.clientY
      }) : null);

      // 1. Check Grid Intersection
      if (gridRef.current) {
        const gridRect = gridRef.current.getBoundingClientRect();
        // Check if pointer is within grid bounds (with some buffer)
        if (
          e.clientX >= gridRect.left && 
          e.clientX <= gridRect.right &&
          e.clientY >= gridRect.top && 
          e.clientY <= gridRect.bottom
        ) {
          const cellSize = gridRect.width / GRID_SIZE;
          // Calculate cell coordinates based on pointer position relative to drag offset
          // We want the piece's "center" or "finger position" to determine the drop
          // Let's use the finger position (e.clientX, e.clientY)
          // To make it feel natural, we often want the piece to snap such that the block under the finger is the pivot
          // BUT, `piece.matrix` 0,0 is top left.
          
          // Let's try mapping the top-left of the dragging element to the grid
          // The dragging element top-left is at: e.clientX - touchOffset.x, e.clientY - touchOffset.y
          // BUT, we usually apply a visual offset (-80px Y) so the user can see.
          // Let's ignore visual offset for calculation, assume finger is "grabbing" the block it touched.
          
          // Simplified: Map finger to grid, then adjust for which block in the shape was grabbed?
          // Too complex. Let's just map the center of the shape to the finger? 
          // Best Mobile UX: The block under the finger snaps to the grid cell under the finger.
          // Since we don't know exactly which block was grabbed easily without complex math,
          // let's assume the finger is near the center of the shape.
          
          // Simple logic: Top-Left of shape is at (Finger X - Width/2, Finger Y - Height/2)
          // Then map that Top-Left to grid.
          
          // Refined: We use the touchOffset.
          // The element's true top-left is (e.clientX - touchOffset.x, e.clientY - touchOffset.y)
          // So grid X = (e.clientX - touchOffset.x - gridRect.left) / cellSize
          
          // Visual Offset Adjustment: The user sees the piece floating ABOVE their finger.
          // So the "target" is actually higher than the finger.
          const visualYOffset = 80; // The amount we lift the piece visually
          const targetX = e.clientX - dragState.touchOffset.x + (cellSize/2); // Center horizontally roughly
          const targetY = e.clientY - dragState.touchOffset.y - visualYOffset + (cellSize/2);
          
          const gx = Math.floor((targetX - gridRect.left) / cellSize);
          const gy = Math.floor((targetY - gridRect.top) / cellSize);
          
          if (gx >= -2 && gx < GRID_SIZE && gy >= -2 && gy < GRID_SIZE) {
             // Clamping/Checking validity happens in canPlacePiece
             // We pass gx, gy as the top-left origin of the shape
             // We need to find the "best" fit if it's slightly off? No, strict grid.
             
             if (canPlacePiece(grid, dragState.piece, gx, gy)) {
                setDropPreview({ x: gx, y: gy });
                setIsHoveringHold(false);
                return;
             }
          }
        }
      }

      // 2. Check Hold Intersection
      if (holdRef.current) {
        const holdRect = holdRef.current.getBoundingClientRect();
        if (
           e.clientX >= holdRect.left && 
           e.clientX <= holdRect.right && 
           e.clientY >= holdRect.top && 
           e.clientY <= holdRect.bottom
        ) {
          setIsHoveringHold(true);
          setDropPreview(null);
          return;
        }
      }

      setDropPreview(null);
      setIsHoveringHold(false);
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (!dragState?.active) return;
      
      const { piece, sourceIndex } = dragState;
      
      // Attempt Drop on Grid
      if (dropPreview) {
        handlePlacePiece(piece, dropPreview.x, dropPreview.y, sourceIndex);
      } 
      // Attempt Drop on Hold
      else if (isHoveringHold) {
        handleHoldDrop(piece, sourceIndex);
      }
      
      // Reset
      setDragState(null);
      setDropPreview(null);
      setIsHoveringHold(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [dragState, grid, dropPreview, isHoveringHold]); // Dependencies critical

  // --- Logic Handlers ---

  const handlePlacePiece = (piece: Shape, x: number, y: number, sourceIndex: number | 'hold') => {
    // 1. Place Piece
    const nextGrid = placePiece(grid, piece, x, y);
    triggerHaptic('success');
    
    // 2. Score Placement
    const blockCount = piece.matrix.flat().reduce((acc, v) => acc + v, 0);
    let turnPoints = blockCount * 10;
    
    // 3. Check Lines
    const { newGrid: clearedGrid, linesCleared } = checkLines(nextGrid);
    
    // 4. Handle Combo & Bonuses
    if (linesCleared > 0) {
      triggerHaptic('heavy');
      const lineScore = calculateScore(linesCleared, combo);
      turnPoints += lineScore;
      
      const earnedKeys = linesCleared; 
      setKeys(k => k + earnedKeys);
      setCombo(c => c + 1);

      confetti({
        particleCount: linesCleared * 30,
        spread: 80,
        origin: { y: 0.5 },
        colors: [piece.color, '#ffffff']
      });
    } else {
      setCombo(1);
    }

    setScore(s => {
      const newScore = s + turnPoints;
      if (newScore > highScore) {
        setHighScore(newScore);
        localStorage.setItem('qblock_highscore', newScore.toString());
      }
      return newScore;
    });
    
    setGrid(clearedGrid);

    // 5. Remove from Source
    if (sourceIndex === 'hold') {
      setHoldPiece(null);
    } else if (typeof sourceIndex === 'number') {
      const newAvailable = [...availablePieces];
      newAvailable[sourceIndex] = null as any; // Temporary mark
      const remaining = newAvailable.filter(p => p !== null); // Remove nulls?
      // Actually, we usually want to keep the gap until refill? 
      // Standard blockudoku: list shrinks.
      const filtered = availablePieces.filter((_, i) => i !== sourceIndex);
      
      if (filtered.length === 0) {
        spawnPieces();
      } else {
        setAvailablePieces(filtered);
        setSelectedPieceIndex(null);
        
        // Check Game Over
        if (checkGameOver(clearedGrid, filtered, holdPiece)) {
           setPhase('gameover');
        }
      }
    }
  };

  const handleHoldDrop = (piece: Shape, sourceIndex: number | 'hold') => {
    if (sourceIndex === 'hold') return; // Already in hold

    const currentHold = holdPiece;
    setHoldPiece(piece);
    triggerHaptic('medium');

    if (currentHold) {
       // Swap: Put old hold back into available slots
       const newAvailable = [...availablePieces];
       newAvailable[sourceIndex] = currentHold;
       setAvailablePieces(newAvailable);
    } else {
       // Remove from available
       const newAvailable = availablePieces.filter((_, i) => i !== sourceIndex);
       if (newAvailable.length === 0) {
         spawnPieces();
       } else {
         setAvailablePieces(newAvailable);
       }
    }
    setSelectedPieceIndex(null);
  };

  // Button-based Hold (Fallback/Tap interaction)
  const handleHoldButton = () => {
    if (selectedPieceIndex === null) return;
    handleHoldDrop(availablePieces[selectedPieceIndex], selectedPieceIndex);
  };

  const handleRotate = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedPieceIndex === null) return;
    
    if (keys < COST_ROTATE) {
      triggerHaptic('light'); // Error buzz?
      return; 
    }

    triggerHaptic('medium');
    const newPieces = [...availablePieces];
    const piece = newPieces[selectedPieceIndex];
    piece.matrix = rotateMatrix(piece.matrix);
    setAvailablePieces(newPieces);
    setKeys(prev => prev - COST_ROTATE);
  };

  const handleRotateHold = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!holdPiece || keys < COST_ROTATE) return;

      triggerHaptic('medium');
      const newHold = { ...holdPiece };
      newHold.matrix = rotateMatrix(newHold.matrix);
      setHoldPiece(newHold);
      setKeys(prev => prev - COST_ROTATE);
  };

  const handleAskAI = async () => {
    if (isLoadingHint) return;
    triggerHaptic('light');
    setIsLoadingHint(true);
    const hint = await getAIHint(grid, availablePieces);
    setAiHint(hint);
    setIsLoadingHint(false);
  };

  // --- Rendering Helpers ---

  // Preview Cells Calculation
  const getPreviewCells = () => {
    // If dragging and valid drop
    if (dropPreview && dragState) {
      const piece = dragState.piece;
      const cells: {x: number, y: number}[] = [];
      for (let y = 0; y < piece.matrix.length; y++) {
          for (let x = 0; x < piece.matrix[y].length; x++) {
              if (piece.matrix[y][x] === 1) {
                  cells.push({ x: dropPreview.x + x, y: dropPreview.y + y });
              }
          }
      }
      return cells;
    }
    return [];
  };

  const previewCells = getPreviewCells();

  return (
    <div className="fixed inset-0 bg-[#0f172a] flex flex-col items-center justify-between text-slate-100 overflow-hidden font-sans select-none touch-none">
      
      {/* Background FX */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,rgba(16,185,129,0.1),transparent_70%)] animate-pulse duration-[5000ms]" />
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] bg-purple-600/20 rounded-full blur-[100px]" />
        <div className="absolute top-[40%] -right-[10%] w-[40%] h-[40%] bg-cyan-600/20 rounded-full blur-[100px]" />
      </div>

      {/* DRAG LAYER (Portal-like) */}
      {dragState && (
        <div 
            className="fixed z-[100] pointer-events-none touch-none"
            style={{
                left: dragState.currentX,
                top: dragState.currentY,
                transform: `translate(-${dragState.touchOffset.x}px, -${dragState.touchOffset.y + 80}px) scale(1.1)`, // Lifted by 80px
            }}
        >
            <PieceView shape={dragState.piece} />
            <div className="mt-2 text-center text-xs font-bold text-white/80 bg-black/50 rounded-full px-2 py-1 backdrop-blur-md">
                Dragging
            </div>
        </div>
      )}

      {/* START SCREEN */}
      {phase === 'start' && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in duration-500 bg-[#0f172a]">
          <div className="mb-8 relative">
            <div className="absolute inset-0 bg-cyan-500 blur-3xl opacity-20 rounded-full"></div>
            <h1 className="relative text-5xl md:text-6xl font-display font-bold text-transparent bg-clip-text bg-gradient-to-br from-cyan-400 via-blue-500 to-purple-600 mb-2 glow-text">
              NEON Q-BLOCK
            </h1>
            <h2 className="relative text-2xl font-display text-white/80 tracking-widest uppercase">Master</h2>
          </div>

          <div className="w-full max-w-sm glass-panel p-6 rounded-2xl mb-8 border border-white/10 shadow-2xl">
            <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-4">
               <span className="text-slate-400 uppercase text-xs tracking-wider">Best Score</span>
               <span className="text-2xl font-bold text-yellow-400 font-display flex items-center gap-2">
                 <Trophy size={20} /> {highScore}
               </span>
            </div>
            <p className="text-slate-300 text-sm leading-relaxed">
              Drag shapes to the grid. Clear lines for keys. 
              Double tap or use keys to flip.
            </p>
          </div>

          <button 
            onClick={startGame}
            className="group relative px-10 py-4 bg-white text-slate-900 rounded-full font-bold text-xl shadow-[0_0_40px_-10px_rgba(255,255,255,0.5)] active:scale-95 transition-all duration-200"
          >
            <span className="flex items-center gap-3">
              <Play className="fill-slate-900" /> START GAME
            </span>
          </button>
        </div>
      )}

      {/* GAME UI */}
      {phase !== 'start' && (
        <>
          {/* Header */}
          <header className="w-full max-w-lg flex items-center justify-between z-10 p-4 pt-6">
            <div className="glass-panel px-5 py-2 rounded-xl flex flex-col items-start min-w-[120px]">
               <span className="text-[10px] text-slate-400 font-display uppercase tracking-widest">Score</span>
               <span className="text-2xl font-bold font-display text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 glow-text">
                 {score}
               </span>
            </div>

            <div className="flex items-center gap-3">
                 {combo > 1 && (
                    <div className="animate-bounce glass-panel px-3 py-1 rounded-full flex items-center gap-1 text-purple-400 border-purple-500/30 bg-purple-500/10">
                        <Zap size={14} className="fill-purple-400" />
                        <span className="font-bold font-display">{combo}x</span>
                    </div>
                 )}

                 <div className="glass-panel px-4 py-2 rounded-full flex items-center gap-2 text-amber-400 border-amber-500/30 bg-amber-500/10 shadow-[0_0_15px_-5px_rgba(245,158,11,0.5)]">
                    <Key size={18} className="fill-amber-400" />
                    <span className="font-bold text-lg font-display">{keys}</span>
                </div>
            </div>
          </header>

          {/* Main Game Area */}
          <main className="w-full max-w-lg relative z-10 flex-1 flex flex-col items-center justify-start pt-4 px-4 gap-4">
            
            {/* AI Hint Panel */}
            {aiHint && (
                <div className="w-full animate-in slide-in-from-top-4 fade-in duration-300 mb-2">
                    <div className="glass-panel p-3 rounded-xl border-l-4 border-l-cyan-400 flex justify-between items-start shadow-xl bg-slate-900/90">
                        <div className="flex gap-3">
                            <Sparkles className="text-cyan-400 shrink-0 mt-1" size={16} />
                            <p className="text-xs text-cyan-50 italic leading-relaxed">"{aiHint}"</p>
                        </div>
                        <button onClick={() => setAiHint(null)} className="text-slate-500 hover:text-white transition-colors ml-2"><X size={16}/></button>
                    </div>
                </div>
            )}

            {/* Board */}
            <div 
                ref={gridRef}
                className="w-full aspect-square glass-panel p-2 rounded-2xl relative shadow-2xl shadow-black/50 border border-white/5 touch-none"
            >
               <div 
                 className="w-full h-full grid gap-1"
                 style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, minmax(0, 1fr))` }}
               >
                 {Array.from({ length: GRID_SIZE * GRID_SIZE }).map((_, i) => {
                   const x = i % GRID_SIZE;
                   const y = Math.floor(i / GRID_SIZE);
                   const isPreview = previewCells.some(p => p.x === x && p.y === y);
                   
                   return (
                     <GridCell 
                        key={i} 
                        color={grid[y][x]} 
                        isValidDrop={isPreview}
                        onClick={() => {}} // Disabled click to place
                     />
                   );
                 })}
               </div>
            </div>

            {/* Middle Controls */}
            <div className="w-full flex justify-between items-end h-24">
                
                {/* Hold Slot */}
                <div className="flex flex-col gap-1 items-center">
                    <button 
                      ref={holdRef as any}
                      onClick={handleHoldButton}
                      className={`
                        w-20 h-20 glass-panel rounded-xl flex items-center justify-center transition-all duration-200 relative
                        ${isHoveringHold ? 'bg-emerald-500/30 scale-110 ring-2 ring-emerald-400' : ''}
                        ${!holdPiece ? 'opacity-80' : 'opacity-100'}
                      `}
                    >
                       {holdPiece ? (
                           <PieceView 
                              shape={holdPiece} 
                              size="sm" 
                              onPointerDown={(e) => handleDragStart(e, holdPiece, 'hold')}
                           />
                       ) : (
                           <div className="flex flex-col items-center gap-1 text-slate-600">
                               <Archive size={20} />
                               <span className="text-[10px] uppercase font-bold">Hold</span>
                           </div>
                       )}
                       
                       {/* Rotate Hold Button (Mini) */}
                       {holdPiece && (
                           <div 
                              onClick={handleRotateHold}
                              className="absolute -top-2 -right-2 bg-slate-800 text-cyan-400 p-1 rounded-full border border-cyan-500/30 shadow-lg cursor-pointer active:scale-90"
                           >
                               <RefreshCw size={12} />
                           </div>
                       )}
                    </button>
                </div>

                 {/* Center Info */}
                 <div className="flex-1 flex flex-col justify-end items-center pb-2 px-2">
                     <div className="flex items-center gap-2 text-slate-500 text-xs uppercase tracking-widest font-bold mb-1">
                        <Hand size={12} /> Drag & Drop
                     </div>
                     <div className="text-xs text-cyan-400/80 font-display text-center">
                        {COST_ROTATE} Keys to Flip
                     </div>
                 </div>

                 {/* Actions Right */}
                 <div className="flex flex-col gap-2 items-end">
                     <button 
                        onClick={handleRotate}
                        disabled={selectedPieceIndex === null || keys < COST_ROTATE}
                        className={`
                            h-12 px-5 rounded-xl glass-panel flex items-center gap-2 transition-all duration-200
                            ${selectedPieceIndex !== null && keys >= COST_ROTATE 
                                ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400 active:scale-95 shadow-[0_0_15px_-5px_rgba(6,182,212,0.3)]' 
                                : 'opacity-40 grayscale'}
                        `}
                     >
                         <span className="font-bold font-display">Flip</span>
                         <RefreshCw size={18} />
                     </button>

                     <button 
                        onClick={handleAskAI}
                        disabled={isLoadingHint}
                        className="h-10 px-4 rounded-lg glass-panel flex items-center gap-2 active:scale-95 text-purple-400 transition-all border border-purple-500/20"
                     >
                         <Sparkles size={16} className={isLoadingHint ? 'animate-spin' : ''} />
                         <span className="text-xs font-bold">Hint</span>
                     </button>
                 </div>
            </div>

          </main>

          {/* Footer Pieces */}
          <footer className="w-full max-w-lg pb-6 pt-2 px-4 z-10">
            <div className="flex justify-around items-center h-28 glass-panel rounded-2xl border-white/5 bg-slate-900/50 relative">
                {availablePieces.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm animate-pulse gap-2">
                        <RotateCcw className="animate-spin" size={16}/> Restocking...
                    </div>
                )}
                
                {availablePieces.map((piece, idx) => (
                    <div key={piece.id} className="relative w-1/3 flex justify-center h-full items-center">
                         {/* Selection Highlight */}
                         {selectedPieceIndex === idx && !dragState && (
                            <div className="absolute inset-2 bg-white/5 rounded-xl border border-white/10 animate-pulse -z-10" />
                         )}
                         
                         {/* We hide the piece here if it's currently being dragged from this spot */}
                         <div className={dragState?.sourceIndex === idx ? 'opacity-0' : 'opacity-100'}>
                             <PieceView 
                                shape={piece} 
                                selected={selectedPieceIndex === idx}
                                onPointerDown={(e) => handleDragStart(e, piece, idx)}
                             />
                         </div>
                    </div>
                ))}
            </div>
          </footer>
        </>
      )}

      {/* Game Over Overlay */}
      {phase === 'gameover' && (
          <div className="absolute inset-0 z-50 bg-slate-900/95 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-500">
              <Trophy size={80} className="text-yellow-400 mb-6 drop-shadow-[0_0_30px_rgba(250,204,21,0.6)] animate-bounce" />
              <h2 className="text-5xl font-display font-bold text-white mb-2">Game Over</h2>
              
              <div className="grid grid-cols-2 gap-6 w-full max-w-sm mb-10 mt-8">
                  <div className="bg-white/5 p-4 rounded-2xl border border-white/10 flex flex-col items-center">
                      <div className="text-xs text-slate-500 uppercase tracking-widest mb-2">Score</div>
                      <div className="text-3xl font-bold text-cyan-400 font-display">{score}</div>
                  </div>
                  <div className="bg-white/5 p-4 rounded-2xl border border-white/10 flex flex-col items-center">
                      <div className="text-xs text-slate-500 uppercase tracking-widest mb-2">Best</div>
                      <div className="text-3xl font-bold text-yellow-400 font-display">{highScore}</div>
                  </div>
              </div>

              <button 
                onClick={startGame}
                className="w-64 py-4 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-full font-bold text-xl shadow-lg shadow-cyan-500/40 active:scale-95 transition-all flex items-center justify-center gap-3"
              >
                  <RefreshCw size={24} /> Try Again
              </button>
              
              <button 
                 onClick={() => setPhase('start')}
                 className="mt-6 text-slate-500 active:text-white text-sm p-4"
              >
                  Back to Menu
              </button>
          </div>
      )}

    </div>
  );
};

export default App;