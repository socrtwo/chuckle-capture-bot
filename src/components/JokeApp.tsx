import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Camera, Mic, MicOff, Smile, Download, RotateCcw, Volume2, Settings, Upload, FileDown, AlertTriangle } from 'lucide-react';
import { getRandomJoke } from '@/data/jokes';
import { toast } from 'sonner';
import * as faceapi from '@vladmandic/face-api';

// Browser compatibility check
const isBrowserSupported = () => {
  const isOpera = /Opera|OPR/i.test(navigator.userAgent);
  const isAloha = /Aloha/i.test(navigator.userAgent);
  const hasCameraSupport = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  const hasSpeechSupport = 'speechSynthesis' in window;
  
  return {
    isSupported: hasCameraSupport && hasSpeechSupport && !isOpera && !isAloha,
    issues: {
      camera: !hasCameraSupport,
      speech: !hasSpeechSupport,
      opera: isOpera,
      aloha: isAloha
    }
  };
};

interface VoiceOption {
  id: string;
  name: string;
  gender: 'male' | 'female';
  ageGroup: 'child' | 'adult' | 'old';
  voiceName?: string;
}

interface CapturedPhoto {
  id: string;
  dataUrl: string;
  timestamp: Date;
  joke: string;
  mode: 'auto' | 'semi-auto' | 'manual' | 'fully-auto';
}

type AppMode = 'auto' | 'semi-auto' | 'manual' | 'fully-auto';

const JokeApp: React.FC = () => {
  const [mode, setMode] = useState<AppMode>('auto');
  const [isRecording, setIsRecording] = useState(false);
  const [currentJoke, setCurrentJoke] = useState('');
  const [capturedPhotos, setCapturedPhotos] = useState<CapturedPhoto[]>([]);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [isDetectingSmile, setIsDetectingSmile] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [photosThisJoke, setPhotosThisJoke] = useState(0);
  const [maxPhotosPerJoke] = useState(5);
  const [fullyAutoJokeCount, setFullyAutoJokeCount] = useState(5);
  const [isRunningFullyAuto, setIsRunningFullyAuto] = useState(false);
  const [currentFullyAutoJoke, setCurrentFullyAutoJoke] = useState(0);
  const [selectedVoiceType, setSelectedVoiceType] = useState<string>('adult-man');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [maxPhotosPerSmileDetection, setMaxPhotosPerSmileDetection] = useState(5);
  const [timeBetweenAutoPhotos, setTimeBetweenAutoPhotos] = useState(0.5);
  const [totalJokesCount, setTotalJokesCount] = useState(0);
  const [importMode, setImportMode] = useState<'replace' | 'add'>('replace');
  const [recentJokes, setRecentJokes] = useState<string[]>([]);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const speechSynthRef = useRef<SpeechSynthesisUtterance | null>(null);
  const fullyAutoTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load face-api models
  useEffect(() => {
    const loadModels = async () => {
      try {
        // Try to load models from CDN instead of local files
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri('https://raw.githubusercontent.com/vladmandic/face-api/master/model'),
          faceapi.nets.faceLandmark68Net.loadFromUri('https://raw.githubusercontent.com/vladmandic/face-api/master/model'),
          faceapi.nets.faceExpressionNet.loadFromUri('https://raw.githubusercontent.com/vladmandic/face-api/master/model')
        ]);
        setIsModelLoaded(true);
        toast.success('Face detection models loaded!');
      } catch (error) {
        console.error('Error loading models:', error);
        toast.error('Face detection not available. Manual photo mode still works!');
        // Don't block the app if models fail to load
        setIsModelLoaded(false);
      }
    };

    loadModels();
  }, []);

  // Load available voices and get jokes count
  useEffect(() => {
    const loadVoices = () => {
      const voices = speechSynthesis.getVoices();
      setAvailableVoices(voices);
    };

    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;

    // Load jokes count
    const loadJokesCount = async () => {
      try {
        const jokesModule = await import('@/data/jokes');
        const jokes = jokesModule.getAllJokes();
        setTotalJokesCount(jokes.length);
      } catch (error) {
        console.error('Error loading jokes count:', error);
      }
    };

    loadJokesCount();
  }, []);

  // Voice type options
  const voiceTypes = [
    { id: 'elderly-woman', name: 'Elderly Woman', gender: 'female', ageGroup: 'old' },
    { id: 'elderly-man', name: 'Elderly Man', gender: 'male', ageGroup: 'old' },
    { id: 'adult-woman', name: 'Adult Woman', gender: 'female', ageGroup: 'adult' },
    { id: 'adult-man', name: 'Adult Man', gender: 'male', ageGroup: 'adult' },
    { id: 'female-child', name: 'Female Child', gender: 'female', ageGroup: 'child' },
    { id: 'male-child', name: 'Male Child', gender: 'male', ageGroup: 'child' },
  ];

  // Find voice based on selected type
  const findVoiceByType = useCallback((voiceTypeId: string): SpeechSynthesisVoice | null => {
    if (availableVoices.length === 0) return null;

    const voiceType = voiceTypes.find(v => v.id === voiceTypeId);
    if (!voiceType) return availableVoices[0];

    // Find voice matching the type criteria
    const matchingVoices = availableVoices.filter(voice => {
      const nameLower = voice.name.toLowerCase();
      const isEnglish = voice.lang.includes('en-US') || voice.lang.includes('en');
      
      if (!isEnglish) return false;

      // Gender matching
      const isCorrectGender = voiceType.gender === 'male' ? 
        (nameLower.includes('male') || nameLower.includes('man') || nameLower.includes('david') || nameLower.includes('daniel') || nameLower.includes('tom') || nameLower.includes('fred') || nameLower.includes('aaron') || nameLower.includes('george') || nameLower.includes('paul')) :
        (nameLower.includes('female') || nameLower.includes('woman') || nameLower.includes('anna') || nameLower.includes('sophia') || nameLower.includes('emma') || nameLower.includes('olivia') || nameLower.includes('sarah') || nameLower.includes('susan'));

      return isCorrectGender;
    });

    return matchingVoices[0] || availableVoices[0];
  }, [availableVoices]);

  // Start camera with better mobile compatibility
  const startCamera = useCallback(async () => {
    try {
      // Check if getUserMedia is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        toast.error('Camera not supported in this browser. Try Chrome or Firefox.');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: 640, 
          height: 480,
          facingMode: 'user'
        },
        audio: false 
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setCameraActive(true);
        toast.success('Camera activated!');
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      let errorMessage = 'Failed to access camera. ';
      
      if (error.name === 'NotAllowedError') {
        errorMessage += 'Please allow camera permissions and reload.';
      } else if (error.name === 'NotFoundError') {
        errorMessage += 'No camera found.';
      } else if (error.name === 'NotSupportedError') {
        errorMessage += 'Camera not supported. Try Chrome or Firefox.';
      } else {
        errorMessage += 'Try using Chrome or Firefox browser.';
      }
      
      toast.error(errorMessage);
    }
  }, []);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setIsDetectingSmile(false);
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
    }
  }, []);

  // Capture photo from video feed
  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    // Check photo limit for current joke (user configurable max)
    if (photosThisJoke >= maxPhotosPerSmileDetection) {
      toast.error(`Maximum ${maxPhotosPerSmileDetection} photos per joke reached! Get a new joke to continue.`);
      setIsDetectingSmile(false);
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }
      return;
    }

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const context = canvas.getContext('2d');

    if (context) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      const newPhoto: CapturedPhoto = {
        id: Date.now().toString(),
        dataUrl,
        timestamp: new Date(),
        joke: currentJoke,
        mode
      };

      setCapturedPhotos(prev => [newPhoto, ...prev]);
      setPhotosThisJoke(prev => prev + 1);
      
      // Create flash effect
      if (videoRef.current) {
        videoRef.current.style.filter = 'brightness(2)';
        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.style.filter = 'brightness(1)';
          }
        }, 150);
      }

      // Show photo count update
      const remaining = maxPhotosPerSmileDetection - (photosThisJoke + 1);
      if (remaining > 0) {
        toast.success(`📸 Photo captured! ${remaining} more allowed for this joke.`);
      } else {
        toast.success(`📸 Final photo captured! Get a new joke for more photos.`);
        setIsDetectingSmile(false);
        if (detectionIntervalRef.current) {
          clearInterval(detectionIntervalRef.current);
        }
      }
    }
  }, [currentJoke, mode, photosThisJoke, maxPhotosPerJoke]);

  // Detect smiles in video feed
  const detectSmile = useCallback(async () => {
    // Check if video element is ready and playing
    if (!videoRef.current || !isModelLoaded) {
      console.log('detectSmile: video or model not ready', { video: !!videoRef.current, model: isModelLoaded });
      return;
    }

    // Check if video is actually playing
    if (videoRef.current.readyState < 2) {
      console.log('detectSmile: video not ready, readyState:', videoRef.current.readyState);
      return;
    }

    // Check if we've reached the photo limit for this joke
    if (photosThisJoke >= maxPhotosPerSmileDetection) {
      console.log('Max photos reached for this joke');
      setIsDetectingSmile(false);
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }
      return;
    }

    try {
      const detections = await faceapi
        .detectAllFaces(videoRef.current, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceExpressions();

      if (detections.length > 0) {
        const expressions = detections[0].expressions;
        const happiness = expressions.happy;
        
        console.log('Smile detection - happiness level:', happiness);
        
        // Trigger photo if happiness level is above threshold
        if (happiness > 0.6) {
          console.log('Smile detected! Taking photo...');
          capturePhoto();
          
          // Pause smile detection to respect time between photos setting
          setIsDetectingSmile(false);
          if (detectionIntervalRef.current) {
            clearInterval(detectionIntervalRef.current);
          }
          
          // Resume after the configured delay (unless we've hit the max)
          setTimeout(() => {
            if (photosThisJoke + 1 < maxPhotosPerSmileDetection) {
              console.log('Resuming smile detection after configured delay');
              setIsDetectingSmile(true);
              detectionIntervalRef.current = setInterval(detectSmile, 100);
            } else {
              console.log('Max photos reached, not resuming smile detection');
            }
          }, timeBetweenAutoPhotos * 1000);
          
          if (mode !== 'fully-auto') {
            toast.success('😊 Smile detected! Photo captured!');
          } else {
            toast.success('😊 Smile detected! Photo captured! Still watching for more smiles...');
          }
        }
      } else {
        console.log('No faces detected in frame');
      }
    } catch (error) {
      console.error('Error detecting faces:', error);
    }
  }, [isModelLoaded, capturePhoto, photosThisJoke, maxPhotosPerSmileDetection, timeBetweenAutoPhotos, mode]);

  // Start smile detection
  const startSmileDetection = useCallback((forceCameraActive = false) => {
    const cameraReady = forceCameraActive || cameraActive;
    console.log('startSmileDetection called, isModelLoaded:', isModelLoaded, 'cameraActive:', cameraReady);
    if (!isModelLoaded || !cameraReady) {
      toast.error('Camera or face detection not ready');
      console.log('Cannot start smile detection - requirements not met');
      return;
    }

    setIsDetectingSmile(true);
    toast.info('😊 Watching for smiles...');
    console.log('Smile detection started');
    
    detectionIntervalRef.current = setInterval(detectSmile, 100);
    
    // Only auto-stop detection after 30 seconds for non-fully-auto modes
    if (mode !== 'fully-auto') {
      setTimeout(() => {
        if (detectionIntervalRef.current) {
          clearInterval(detectionIntervalRef.current);
          setIsDetectingSmile(false);
          toast.info('Smile detection stopped');
          console.log('Smile detection auto-stopped after 30s');
        }
      }, 30000);
    }
  }, [detectSmile, isModelLoaded, cameraActive, mode]);

  // Get a new random joke with improved randomization to avoid repetition
  const getNewJoke = useCallback(() => {
    let joke = getRandomJoke();
    let attempts = 0;
    const maxAttempts = 10; // Prevent infinite loops
    
    // Try to avoid recently used jokes if we have enough jokes available
    while (recentJokes.includes(joke) && attempts < maxAttempts) {
      joke = getRandomJoke();
      attempts++;
    }
    
    // Update recent jokes list (keep last 20 jokes)
    setRecentJokes(prev => {
      const updated = [joke, ...prev.slice(0, 19)];
      return updated;
    });
    
    setCurrentJoke(joke);
    setPhotosThisJoke(0); // Reset photo counter for new joke
    console.log('Selected joke:', joke, 'Attempts to avoid repetition:', attempts);
    return joke;
  }, [recentJokes]);

  // Stop speech
  const stopSpeech = useCallback(() => {
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel();
    }
  }, []);

  // Stop fully auto mode
  const stopFullyAutoMode = useCallback(() => {
    setIsRunningFullyAuto(false);
    setCurrentFullyAutoJoke(0);
    if (fullyAutoTimeoutRef.current) {
      clearTimeout(fullyAutoTimeoutRef.current);
      fullyAutoTimeoutRef.current = null;
    }
    stopSpeech();
    toast.info('Fully auto mode stopped');
  }, [stopSpeech]);

  // Speak joke using Web Speech API with pause between setup and punchline
  const speakJoke = useCallback((joke: string) => {
    if ('speechSynthesis' in window) {
      // Cancel any ongoing speech
      speechSynthesis.cancel();
      
      // Split joke into setup and punchline (assuming they're separated by a question mark or period)
      const parts = joke.split(/[.!?](?=\s)/);
      const setup = parts[0] + (joke.includes('?') ? '?' : '.');
      const punchline = parts.slice(1).join('').trim();
      
      // Speak setup first
      const setupUtterance = new SpeechSynthesisUtterance(setup);
      
      // Use selected voice type
      const voice = findVoiceByType(selectedVoiceType);
      if (voice) {
        setupUtterance.voice = voice;
      }
      
      // Standard speech parameters for Microsoft Dave
      setupUtterance.rate = 0.9;
      setupUtterance.pitch = 1.0;
      setupUtterance.volume = 0.8;

      setupUtterance.onstart = () => {
        toast.info('🎭 Microsoft Dave telling joke...');
      };
      
      setupUtterance.onend = () => {
        // Add a 1.5 second pause before punchline
        setTimeout(() => {
          if (punchline) {
            const punchlineUtterance = new SpeechSynthesisUtterance(punchline);
            
            // Same voice settings for punchline
            if (voice) {
              punchlineUtterance.voice = voice;
            }
            
            punchlineUtterance.rate = 0.9;
            punchlineUtterance.pitch = 1.0;
            punchlineUtterance.volume = 0.8;
            
            punchlineUtterance.onend = () => {
              console.log('Punchline finished, mode:', mode);
              // Don't restart smile detection here - it should already be running
              
              if (mode === 'fully-auto') {
                // Check if we're still in fully auto mode
                setIsRunningFullyAuto(prevState => {
                  console.log('Checking fully auto state in onend:', prevState);
                  if (prevState) {
                    // Continue with next joke in fully auto mode
                    setCurrentFullyAutoJoke(prevJoke => {
                      const nextJokeNumber = prevJoke + 1;
                      console.log(`Finished joke ${prevJoke + 1}/${fullyAutoJokeCount}, next: ${nextJokeNumber}`);
                      if (nextJokeNumber < fullyAutoJokeCount) {
                        toast.info(`Next joke in 5 seconds... (${nextJokeNumber + 1}/${fullyAutoJokeCount})`);
                        fullyAutoTimeoutRef.current = setTimeout(() => {
                          setCurrentFullyAutoJoke(nextJokeNumber);
                          const nextJoke = getNewJoke();
                          console.log(`Starting joke ${nextJokeNumber + 1}: ${nextJoke}`);
                          speakJoke(nextJoke);
                        }, 5000); // 5 second wait
                        return nextJokeNumber;
                      } else {
                        // Finished all jokes
                        toast.success(`Completed ${fullyAutoJokeCount} jokes in fully auto mode!`);
                        setIsRunningFullyAuto(false);
                        return 0;
                      }
                    });
                  }
                  return prevState;
                });
              }
            };

            speechSynthRef.current = punchlineUtterance;
            speechSynthesis.speak(punchlineUtterance);
            } else {
              // If no punchline, start smile detection immediately
              if (mode === 'auto' || mode === 'semi-auto') {
                startSmileDetection();
              } else if (mode === 'fully-auto' && isRunningFullyAuto) {
                // Start smile detection for fully auto mode - reuse same logic
                startSmileDetection();
                
                // Continue with next joke in fully auto mode
                const nextJokeNumber = currentFullyAutoJoke + 1;
                if (nextJokeNumber < fullyAutoJokeCount) {
                  toast.info(`Next joke in 5 seconds... (${nextJokeNumber + 1}/${fullyAutoJokeCount})`);
                  fullyAutoTimeoutRef.current = setTimeout(() => {
                    setCurrentFullyAutoJoke(nextJokeNumber);
                    const nextJoke = getNewJoke();
                    speakJoke(nextJoke);
                  }, 5000); // 5 second wait
                } else {
                  // Finished all jokes - keep camera on
                  setIsRunningFullyAuto(false);
                  setCurrentFullyAutoJoke(0);
                  toast.success(`Completed ${fullyAutoJokeCount} jokes in fully auto mode! Camera remains active.`);
                }
              }
            }
        }, 1500); // 1.5 second pause
      };

      speechSynthRef.current = setupUtterance;
      speechSynthesis.speak(setupUtterance);
    } else {
      toast.error('Speech synthesis not supported in this browser');
      if (mode === 'auto' || mode === 'semi-auto') {
        startSmileDetection();
      } else if (mode === 'fully-auto' && isRunningFullyAuto) {
        // Start smile detection for fully auto mode - reuse same logic
        startSmileDetection();
        
        // Continue with next joke even without speech
        const nextJokeNumber = currentFullyAutoJoke + 1;
        if (nextJokeNumber < fullyAutoJokeCount) {
          toast.info(`Next joke in 5 seconds... (${nextJokeNumber + 1}/${fullyAutoJokeCount})`);
          fullyAutoTimeoutRef.current = setTimeout(() => {
            setCurrentFullyAutoJoke(nextJokeNumber);
            const nextJoke = getNewJoke();
            speakJoke(nextJoke);
          }, 5000);
        } else {
          setIsRunningFullyAuto(false);
          setCurrentFullyAutoJoke(0);
          toast.success(`Completed ${fullyAutoJokeCount} jokes in fully auto mode! Camera remains active.`);
        }
      }
    }
  }, [mode, findVoiceByType, selectedVoiceType, startSmileDetection, isRunningFullyAuto, currentFullyAutoJoke, fullyAutoJokeCount, getNewJoke, isModelLoaded, cameraActive]);

  // Enhanced getNewJoke that triggers auto mode if refresh is clicked
  const getNewJokeWithAutoTrigger = useCallback(() => {
    const joke = getNewJoke();
    
    // If we're in auto mode and camera is active, automatically start the auto sequence
    if (mode === 'auto' && cameraActive) {
      speakJoke(joke);
    }
    
    return joke;
  }, [getNewJoke, mode, cameraActive, speakJoke]);

  // Auto mode: Tell single joke and detect smiles
  const startAutoMode = useCallback(async () => {
    if (!cameraActive) {
      toast.error('Please start the camera first');
      return;
    }
    
    // Start smile detection immediately
    if (isModelLoaded) {
      startSmileDetection();
    }
    
    const joke = getNewJoke();
    speakJoke(joke);
  }, [cameraActive, getNewJoke, speakJoke, isModelLoaded, startSmileDetection]);

  // Fully Auto mode: Start camera and tell multiple jokes automatically
  const startFullyAutoMode = useCallback(async () => {
    console.log('Starting fully auto mode with', fullyAutoJokeCount, 'jokes');
    setIsRunningFullyAuto(true);
    setCurrentFullyAutoJoke(0);
    
    // Start camera if not active
    if (!cameraActive) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { width: 640, height: 480 },
          audio: false 
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          streamRef.current = stream;
          setCameraActive(true);
          toast.success('Camera activated for fully auto mode!');
          
          // Wait a moment for camera to be ready, then start first joke
          setTimeout(() => {
            const joke = getNewJoke();
            console.log('First joke in fully auto mode:', joke);
            speakJoke(joke);
            
            // Start smile detection immediately for fully auto mode
            console.log('Starting smile detection in fully auto, isModelLoaded:', isModelLoaded, 'cameraActive:', true);
            if (isModelLoaded) {
              startSmileDetection(true); // Force camera active since we just activated it
            }
          }, 1000);
          return;
        }
      } catch (error) {
        console.error('Error accessing camera:', error);
        toast.error('Failed to access camera. Please check permissions.');
        setIsRunningFullyAuto(false);
        setCurrentFullyAutoJoke(0);
        return;
      }
    }
    
    toast.success(`Starting fully auto mode: ${fullyAutoJokeCount} jokes with 5s pauses`);
    
    // Start smile detection immediately since camera is already active
    if (isModelLoaded) {
      console.log('Starting smile detection in fully auto (camera already active)');
      startSmileDetection(true); // Force camera active
    }
    
    // Start first joke immediately (camera already active)
    const joke = getNewJoke();
    console.log('First joke in fully auto mode:', joke);
    speakJoke(joke);
  }, [cameraActive, getNewJoke, speakJoke, fullyAutoJokeCount]);

  // Semi-auto mode: Manual joke telling, auto photo
  const startSemiAutoMode = useCallback(async () => {
    if (!cameraActive) {
      toast.error('Please start the camera first');
      return;
    }
    
    getNewJoke();
    toast.info('Tell the joke manually, then click "Start Smile Detection"');
  }, [cameraActive, getNewJoke]);

  // Manual mode: Everything manual
  const startManualMode = useCallback(async () => {
    if (!cameraActive) {
      toast.error('Please start the camera first');
      return;
    }
    
    getNewJoke();
    toast.info('Manual mode: Tell joke and take photo manually');
  }, [cameraActive, getNewJoke]);

  // Download photo
  const downloadPhoto = useCallback((photo: CapturedPhoto) => {
    const link = document.createElement('a');
    link.download = `joke-photo-${photo.timestamp.toISOString().slice(0, 10)}.jpg`;
    link.href = photo.dataUrl;
    link.click();
  }, []);

  // Clear all photos
  const clearPhotos = useCallback(() => {
    setCapturedPhotos([]);
    toast.success('All photos cleared');
  }, []);

  // Download template for joke import
  const downloadTemplate = useCallback(() => {
    const templateJokes = [
      "Why don't scientists trust atoms? Because they make up everything!",
      "What do you call a fake noodle? An impasta!",
      "Why did the scarecrow win an award? He was outstanding in his field!"
    ];
    
    const dataStr = JSON.stringify(templateJokes, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = 'jokes-template.json';
    link.click();
    
    toast.success('Template downloaded! Edit it and import back.');
  }, []);

  // Export jokes to JSON file
  const exportJokes = useCallback(async () => {
    try {
      // Import the jokes module to get all jokes
      const jokesModule = await import('@/data/jokes');
      const jokes = jokesModule.getAllJokes();
      
      const dataStr = JSON.stringify(jokes, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      
      const link = document.createElement('a');
      link.href = URL.createObjectURL(dataBlob);
      link.download = `jokes-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      
      toast.success('Jokes exported successfully!');
    } catch (error) {
      console.error('Error exporting jokes:', error);
      toast.error('Failed to export jokes');
    }
  }, []);

  // Trigger file input dialog
  const triggerFileImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Import jokes from JSON file
  const importJokes = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const importedJokes = JSON.parse(content);
        
        if (Array.isArray(importedJokes) && importedJokes.length > 0) {
          // Validate that all items are strings
          const validJokes = importedJokes.filter(joke => typeof joke === 'string' && joke.trim().length > 0);
          
          if (validJokes.length === 0) {
            toast.error('No valid jokes found in file');
            return;
          }

          const actionText = importMode === 'replace' ? 'replaced with' : 'added';
          toast.success(`Successfully ${actionText} ${validJokes.length} jokes! (Note: Restart app to see changes)`);
          console.log(`Import mode: ${importMode}`, 'Imported jokes:', validJokes);
        } else {
          toast.error('Invalid jokes file format - must be an array of strings');
        }
      } catch (error) {
        console.error('Error importing jokes:', error);
        toast.error('Failed to import jokes - invalid JSON format');
      }
    };
    
    reader.readAsText(file);
    // Reset input
    event.target.value = '';
  }, []);

  // Enhanced stop speech
  const stopSpeechAndAuto = useCallback(() => {
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel();
    }
    // Also stop fully auto mode if running
    if (isRunningFullyAuto) {
      stopFullyAutoMode();
    }
  }, [isRunningFullyAuto, stopFullyAutoMode]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
      stopSpeechAndAuto();
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }
      if (fullyAutoTimeoutRef.current) {
        clearTimeout(fullyAutoTimeoutRef.current);
      }
    };
  }, [stopCamera, stopSpeechAndAuto]);

  return (
    <div className="min-h-screen bg-gradient-background p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold bg-gradient-fun bg-clip-text text-transparent">
            🎭 Joke & Smile Camera
          </h1>
          <p className="text-muted-foreground">
            Tell jokes, detect smiles, capture joy!
          </p>
        </div>

        {/* Browser Compatibility Warning */}
        {(() => {
          const compatibility = isBrowserSupported();
          if (!compatibility.isSupported) {
            return (
              <Card className="bg-yellow-50 border-yellow-200 dark:bg-yellow-950 dark:border-yellow-800">
                <div className="p-4 flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                  <div className="space-y-2">
                    <h3 className="font-semibold text-yellow-800 dark:text-yellow-200">
                      Browser Compatibility Issues Detected
                    </h3>
                    <p className="text-sm text-yellow-700 dark:text-yellow-300">
                      {compatibility.issues.opera && "Opera browser has known issues with camera access. "}
                      {compatibility.issues.aloha && "Aloha browser has known issues with camera access. "}
                      {compatibility.issues.camera && "Camera access not supported. "}
                      {compatibility.issues.speech && "Speech synthesis not supported. "}
                      For the best experience, please use <strong>Chrome</strong> or <strong>Firefox</strong> on your device.
                    </p>
                  </div>
                </div>
              </Card>
            );
          }
          return null;
        })()}

        <div className="flex gap-6">
          {/* Camera and Controls */}
          <Card className="p-6 flex-1">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Camera className="h-5 w-5 text-camera" />
              Camera Feed
              {isDetectingSmile && (
                <Badge variant="secondary" className="animate-pulse">
                  Detecting Smiles
                </Badge>
              )}
            </h2>
            
            <div className="space-y-4">
              <div className="relative bg-muted rounded-lg overflow-hidden w-1/2 aspect-video">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                <canvas ref={canvasRef} className="hidden" />
                
                {!cameraActive && (
                  <div className="absolute inset-0 flex items-center justify-center bg-muted">
                    <div className="text-center space-y-2">
                      <Camera className="h-12 w-12 mx-auto text-muted-foreground" />
                      <p className="text-muted-foreground">Camera not active</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {mode !== 'fully-auto' && (
                  <>
                    {!cameraActive ? (
                      <Button onClick={startCamera} className="bg-gradient-camera">
                        <Camera className="h-4 w-4 mr-2" />
                        Start Camera
                      </Button>
                    ) : (
                      <Button onClick={stopCamera} variant="outline">
                        <Camera className="h-4 w-4 mr-2" />
                        Stop Camera
                      </Button>
                    )}
                  </>
                )}

                {mode === 'auto' && (
                  <Button 
                    onClick={startAutoMode}
                    disabled={!cameraActive || !isModelLoaded}
                    className="bg-gradient-fun"
                  >
                    <Volume2 className="h-4 w-4 mr-2" />
                    Tell One Joke
                  </Button>
                )}

                {mode === 'fully-auto' && (
                  <>
                    {!isRunningFullyAuto ? (
                      <Button 
                        onClick={startFullyAutoMode}
                        className="bg-gradient-fun"
                      >
                        <Camera className="h-4 w-4 mr-2" />
                        <Volume2 className="h-4 w-4 mr-2" />
                        Start Camera & {fullyAutoJokeCount} Jokes
                      </Button>
                     ) : (
                       <Button 
                         onClick={stopFullyAutoMode}
                         variant="outline"
                       >
                         Stop Auto Mode ({currentFullyAutoJoke + 1}/{fullyAutoJokeCount})
                       </Button>
                     )}
                  </>
                )}

                {mode === 'semi-auto' && (
                  <>
                    <Button 
                      onClick={startSemiAutoMode}
                      disabled={!cameraActive}
                    >
                      <Mic className="h-4 w-4 mr-2" />
                      Get Joke
                    </Button>
                    <Button 
                      onClick={() => startSmileDetection()}
                      disabled={!cameraActive || !isModelLoaded || isDetectingSmile}
                      variant="outline"
                    >
                      <Smile className="h-4 w-4 mr-2" />
                      Detect Smiles
                    </Button>
                  </>
                )}

                {mode === 'manual' && (
                  <>
                    <Button onClick={startManualMode}>
                      <Mic className="h-4 w-4 mr-2" />
                      Get Joke
                    </Button>
                    <Button 
                      onClick={capturePhoto}
                      disabled={!cameraActive || photosThisJoke >= 5}
                      variant="outline"
                    >
                      <Camera className="h-4 w-4 mr-2" />
                      Take Photo {photosThisJoke > 0 && `(${photosThisJoke}/5)`}
                    </Button>
                  </>
                )}

                {/* Manual Photo Button - Available in all modes */}
                {cameraActive && (
                  <Button 
                    onClick={capturePhoto}
                    variant="outline"
                    size="sm"
                    title="Take photo manually"
                  >
                    <Camera className="h-4 w-4 mr-2" />
                    Manual Photo
                  </Button>
                )}

                <Button onClick={stopSpeechAndAuto} variant="outline" size="sm">
                  Stop Speech
                </Button>

                <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Settings className="h-4 w-4 mr-2" />
                      Settings
                    </Button>
                  </DialogTrigger>
                   <DialogContent className="max-w-4xl bg-white text-black border">
                     <DialogHeader>
                       <DialogTitle className="text-black font-semibold">Settings</DialogTitle>
                     </DialogHeader>
                    <div className="grid grid-cols-2 gap-8">
                       {/* Left Column */}
                       <div className="space-y-6">
                        {/* Voice Type Selection */}
                        <div>
                          <label className="text-sm font-medium mb-2 block text-black">Voice Type</label>
                         <div className="grid grid-cols-1 gap-2">
                           {voiceTypes.map((voiceType) => (
                             <Button
                               key={voiceType.id}
                               variant={selectedVoiceType === voiceType.id ? 'default' : 'outline'}
                               onClick={() => setSelectedVoiceType(voiceType.id)}
                               className={`justify-start ${selectedVoiceType === voiceType.id ? 'bg-blue-600 text-white' : 'bg-white text-black border-gray-300 hover:bg-gray-50'}`}
                               size="sm"
                             >
                               {voiceType.name}
                             </Button>
                           ))}
                         </div>
                       </div>

                        {/* Joke Count for Fully Auto */}
                        <div>
                          <label className="text-sm font-medium mb-2 block text-black">Number of Jokes (Fully Auto)</label>
                         <div className="flex items-center gap-2">
                           <input 
                             type="number" 
                             min="1" 
                             max="20" 
                             value={fullyAutoJokeCount}
                             onChange={(e) => setFullyAutoJokeCount(Number(e.target.value))}
                             disabled={isRunningFullyAuto}
                             className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-black focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                           />
                           <span className="text-sm text-gray-600">jokes</span>
                         </div>
                       </div>
                       </div>

                       {/* Right Column */}
                       <div className="space-y-6">
                       {/* Max Photos Per Smile Detection */}
                       <div>
                         <label className="text-sm font-medium mb-2 block text-black">Max Photos per Smile Detection</label>
                         <div className="flex items-center gap-2">
                           <input 
                             type="number" 
                             min="1" 
                             max="20" 
                             value={maxPhotosPerSmileDetection}
                             onChange={(e) => setMaxPhotosPerSmileDetection(Number(e.target.value))}
                             className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-black focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                           />
                           <span className="text-sm text-gray-600">photos</span>
                         </div>
                       </div>

                       {/* Time Between Auto Photos */}
                       <div>
                         <label className="text-sm font-medium mb-2 block text-black">Time Between Auto Photos</label>
                         <div className="flex items-center gap-2">
                           <input 
                             type="number" 
                             min="0.1" 
                             max="10" 
                             step="0.1"
                             value={timeBetweenAutoPhotos}
                             onChange={(e) => setTimeBetweenAutoPhotos(Number(e.target.value))}
                             className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-black focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                           />
                           <span className="text-sm text-gray-600">seconds</span>
                         </div>
                        </div>

                        {/* Total Jokes Count */}
                        <div>
                          <label className="text-sm font-medium mb-2 block text-black">Jokes Database</label>
                          <div className="bg-gray-50 p-3 rounded-md">
                            <div className="text-lg font-bold text-center text-black">
                              {totalJokesCount} Jokes Available
                            </div>
                          </div>
                        </div>

                         {/* Import/Export Jokes */}
                         <div>
                           <label className="text-sm font-medium mb-2 block text-black">Manage Jokes</label>
                           
                           {/* Import Mode Selection */}
                           <div className="mb-3">
                             <label className="text-xs font-medium text-gray-700 mb-1 block">Import Mode:</label>
                             <div className="flex gap-2">
                               <Button
                                 onClick={() => setImportMode('replace')}
                                 variant={importMode === 'replace' ? 'default' : 'outline'}
                                 size="sm"
                                 className="flex-1 text-xs"
                               >
                                 Replace All
                               </Button>
                               <Button
                                 onClick={() => setImportMode('add')}
                                 variant={importMode === 'add' ? 'default' : 'outline'}
                                 size="sm"
                                 className="flex-1 text-xs"
                               >
                                 Add to Existing
                               </Button>
                             </div>
                           </div>

                          <div className="flex gap-2 mb-2">
                            <Button onClick={downloadTemplate} variant="outline" size="sm" className="flex-1 bg-white text-black border-gray-300 hover:bg-gray-50">
                              <Download className="h-4 w-4 mr-2" />
                              Template
                            </Button>
                            <Button onClick={exportJokes} variant="outline" size="sm" className="flex-1 bg-white text-black border-gray-300 hover:bg-gray-50">
                              <FileDown className="h-4 w-4 mr-2" />
                              Export
                            </Button>
                          </div>
                          <Button 
                            onClick={triggerFileImport}
                            variant="outline" 
                            size="sm" 
                            className="w-full bg-white text-black border-gray-300 hover:bg-gray-50"
                          >
                            <Upload className="h-4 w-4 mr-2" />
                            Import ({importMode === 'replace' ? 'Replace' : 'Add'})
                          </Button>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept=".json"
                            onChange={importJokes}
                            className="hidden"
                          />
                          <p className="text-xs text-gray-600 mt-1">
                            Download template, export current jokes, or import JSON format jokes
                          </p>
                        </div>
                       </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </Card>

          {/* Mode Selection - Compact version to fit on the right */}
          <Card className="p-4 w-80">
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Smile className="h-4 w-4 text-smile" />
              Choose Mode
            </h2>
            <div className="space-y-2">
              <Button
                variant={mode === 'fully-auto' ? 'default' : 'outline'}
                onClick={() => setMode('fully-auto')}
                className={`w-full h-auto p-3 flex items-center gap-2 justify-start transition-all ${
                  mode === 'fully-auto' ? 'ring-2 ring-primary ring-offset-2 bg-gradient-fun text-white' : 'hover:bg-muted'
                }`}
                title="Tell multiple jokes automatically with 5s pauses between them"
              >
                <div className="flex items-center gap-1">
                  <Volume2 className="h-4 w-4" />
                  <Volume2 className="h-4 w-4" />
                </div>
                <span className="font-medium">Fully Auto</span>
              </Button>

              <Button
                variant={mode === 'auto' ? 'default' : 'outline'}
                onClick={() => setMode('auto')}
                className={`w-full h-auto p-3 flex items-center gap-2 justify-start transition-all ${
                  mode === 'auto' ? 'ring-2 ring-primary ring-offset-2 bg-gradient-fun text-white' : 'hover:bg-muted'
                }`}
                title="AI tells one joke and automatically detects smiles for photos"
              >
                <Volume2 className="h-5 w-5" />
                <span className="font-medium">Single Joke</span>
              </Button>
              
              <Button
                variant={mode === 'semi-auto' ? 'default' : 'outline'}
                onClick={() => setMode('semi-auto')}
                className={`w-full h-auto p-3 flex items-center gap-2 justify-start transition-all ${
                  mode === 'semi-auto' ? 'ring-2 ring-primary ring-offset-2 bg-gradient-fun text-white' : 'hover:bg-muted'
                }`}
                title="You tell the joke manually, AI detects smiles for photos"
              >
                <div className="flex items-center gap-1">
                  <Mic className="h-4 w-4" />
                  <Camera className="h-4 w-4" />
                </div>
                <span className="font-medium">Semi-Auto</span>
              </Button>
              
              <Button
                variant={mode === 'manual' ? 'default' : 'outline'}
                onClick={() => setMode('manual')}
                className={`w-full h-auto p-3 flex items-center gap-2 justify-start transition-all ${
                  mode === 'manual' ? 'ring-2 ring-primary ring-offset-2 bg-gradient-fun text-white' : 'hover:bg-muted'
                }`}
                title="Full manual control - tell jokes and take photos manually"
              >
                <div className="flex items-center gap-1">
                  <Mic className="h-4 w-4" />
                  <MicOff className="h-4 w-4" />
                </div>
                <span className="font-medium">Manual</span>
              </Button>
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Current Joke Section */}
          <div className="flex gap-6">
            {/* Joke Label Card */}
            <Card className="p-6 w-64">
              <div className="space-y-2">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  🎭 Current Joke
                </h2>
                {isRunningFullyAuto && (
                  <div className="text-sm text-muted-foreground">
                    Progress: {currentFullyAutoJoke + 1}/{fullyAutoJokeCount}
                  </div>
                )}
                <Button 
                  onClick={getNewJokeWithAutoTrigger} 
                  variant="outline" 
                  size="sm"
                  className="w-full"
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  New Joke
                </Button>
              </div>
            </Card>

            {/* Joke Content Card */}
            <Card className="p-6 flex-1">
              <div className="p-4 bg-muted rounded-lg min-h-[120px] flex items-center">
                {currentJoke ? (
                  <p className="text-lg leading-relaxed whitespace-pre-wrap break-words">{currentJoke}</p>
                ) : (
                  <p className="text-muted-foreground italic">
                    Click "Get Joke" to load a joke
                  </p>
                )}
              </div>
            </Card>
          </div>
        </div>

        {/* Captured Photos */}
        {capturedPhotos.length > 0 && (
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                📸 Captured Photos ({capturedPhotos.length})
              </h2>
              <Button onClick={clearPhotos} variant="outline" size="sm">
                Clear All
              </Button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {capturedPhotos.map((photo) => (
                <div key={photo.id} className="space-y-2">
                  <div className="relative group overflow-hidden rounded-lg">
                    <img 
                      src={photo.dataUrl} 
                      alt="Captured smile"
                      className="w-full aspect-video object-cover transition-transform group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Button 
                        onClick={() => downloadPhoto(photo)}
                        size="sm"
                        className="bg-white/20 hover:bg-white/30"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-xs">
                        {photo.mode}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {photo.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {photo.joke}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Status and Info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isModelLoaded ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-sm">Face Detection: {isModelLoaded ? 'Ready' : 'Loading...'}</span>
            </div>
          </Card>
          
          <Card className="p-4">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${cameraActive ? 'bg-green-500' : 'bg-gray-500'}`} />
              <span className="text-sm">Camera: {cameraActive ? 'Active' : 'Inactive'}</span>
            </div>
          </Card>
          
          <Card className="p-4">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isDetectingSmile ? 'bg-blue-500 animate-pulse' : 'bg-gray-500'}`} />
              <span className="text-sm">Smile Detection: {isDetectingSmile ? 'Active' : 'Inactive'}</span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default JokeApp;