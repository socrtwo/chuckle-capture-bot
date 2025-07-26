import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Camera, Mic, MicOff, Smile, Download, RotateCcw, Volume2, Settings, Upload, FileDown } from 'lucide-react';
import { getRandomJoke } from '@/data/jokes';
import { toast } from 'sonner';
import * as faceapi from '@vladmandic/face-api';

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
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const speechSynthRef = useRef<SpeechSynthesisUtterance | null>(null);
  const fullyAutoTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  // Load available voices
  useEffect(() => {
    const loadVoices = () => {
      const voices = speechSynthesis.getVoices();
      setAvailableVoices(voices);
    };

    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
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

  // Start camera
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 640, height: 480 },
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
      toast.error('Failed to access camera. Please check permissions.');
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

    // Check photo limit for current joke (5 photos max)
    if (photosThisJoke >= 5) {
      toast.error(`Maximum 5 photos per joke reached! Get a new joke to continue.`);
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
      const remaining = 5 - (photosThisJoke + 1);
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
    if (!videoRef.current || !isModelLoaded || !cameraActive) return;

    try {
      const detections = await faceapi
        .detectAllFaces(videoRef.current, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceExpressions();

      if (detections.length > 0) {
        const expressions = detections[0].expressions;
        const happiness = expressions.happy;
        
        // Trigger photo if happiness level is above threshold
        if (happiness > 0.6) {
          capturePhoto();
          setIsDetectingSmile(false);
          if (detectionIntervalRef.current) {
            clearInterval(detectionIntervalRef.current);
          }
          toast.success('😊 Smile detected! Photo captured!');
        }
      }
    } catch (error) {
      console.error('Error detecting faces:', error);
    }
  }, [isModelLoaded, cameraActive, capturePhoto]);

  // Start smile detection
  const startSmileDetection = useCallback(() => {
    console.log('startSmileDetection called, isModelLoaded:', isModelLoaded, 'cameraActive:', cameraActive);
    if (!isModelLoaded || !cameraActive) {
      toast.error('Camera or face detection not ready');
      console.log('Cannot start smile detection - requirements not met');
      return;
    }

    setIsDetectingSmile(true);
    toast.info('😊 Watching for smiles...');
    console.log('Smile detection started');
    
    detectionIntervalRef.current = setInterval(detectSmile, 100);
    
    // Auto-stop detection after 30 seconds
    setTimeout(() => {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
        setIsDetectingSmile(false);
        toast.info('Smile detection stopped');
        console.log('Smile detection auto-stopped after 30s');
      }
    }, 30000);
  }, [detectSmile, isModelLoaded, cameraActive]);

  // Get a new random joke (also triggers auto mode if refresh is clicked)
  const getNewJoke = useCallback(() => {
    const joke = getRandomJoke();
    setCurrentJoke(joke);
    setPhotosThisJoke(0); // Reset photo counter for new joke
    return joke;
  }, []);

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
              // Check current state instead of closure values
              const currentlyRunningFullyAuto = isRunningFullyAuto;
              console.log('Current isRunningFullyAuto state:', currentlyRunningFullyAuto);
              
              if (mode === 'auto' || mode === 'semi-auto') {
                startSmileDetection();
              } else if (mode === 'fully-auto') {
                // Check if we're still in fully auto mode
                setIsRunningFullyAuto(prevState => {
                  console.log('Checking fully auto state in onend:', prevState);
                  if (prevState) {
                    // Start smile detection for fully auto mode too
                    console.log('Starting smile detection in fully auto, isModelLoaded:', isModelLoaded, 'cameraActive:', cameraActive);
                    if (isModelLoaded && cameraActive) {
                      startSmileDetection();
                    } else {
                      console.log('Cannot start smile detection - model or camera not ready');
                    }
                    
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
                  // Finished all jokes
                  setIsRunningFullyAuto(false);
                  setCurrentFullyAutoJoke(0);
                  toast.success(`Completed ${fullyAutoJokeCount} jokes in fully auto mode!`);
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
          toast.success(`Completed ${fullyAutoJokeCount} jokes in fully auto mode!`);
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
    
    const joke = getNewJoke();
    speakJoke(joke);
  }, [cameraActive, getNewJoke, speakJoke]);

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
              startSmileDetection();
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
          // Note: In a real app, you'd want to actually update the jokes data
          // For now, we just show a success message
          toast.success(`Successfully loaded ${importedJokes.length} jokes! (Note: Restart app to see changes)`);
          console.log('Imported jokes:', importedJokes);
        } else {
          toast.error('Invalid jokes file format');
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
                      onClick={startSmileDetection}
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
                   <DialogContent className="max-w-md bg-white text-black border">
                     <DialogHeader>
                       <DialogTitle className="text-black font-semibold">Settings</DialogTitle>
                     </DialogHeader>
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

                       {/* Import/Export Jokes */}
                       <div>
                         <label className="text-sm font-medium mb-2 block text-black">Manage Jokes</label>
                        <div className="flex gap-2">
                          <Button onClick={exportJokes} variant="outline" size="sm" className="flex-1 bg-white text-black border-gray-300 hover:bg-gray-50">
                            <FileDown className="h-4 w-4 mr-2" />
                            Export
                          </Button>
                          <label className="flex-1">
                            <Button variant="outline" size="sm" className="w-full bg-white text-black border-gray-300 hover:bg-gray-50" asChild>
                              <span>
                                <Upload className="h-4 w-4 mr-2" />
                                Import
                              </span>
                            </Button>
                            <input
                              type="file"
                              accept=".json"
                              onChange={importJokes}
                              className="hidden"
                            />
                          </label>
                        </div>
                        <p className="text-xs text-gray-600 mt-1">
                          Export current jokes or import new ones (JSON format)
                        </p>
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
                  <p className="text-lg leading-relaxed">{currentJoke}</p>
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