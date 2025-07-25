import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Camera, Mic, MicOff, Smile, Download, RotateCcw, Volume2 } from 'lucide-react';
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
  mode: 'auto' | 'semi-auto' | 'manual';
}

type AppMode = 'auto' | 'semi-auto' | 'manual';

const JokeApp: React.FC = () => {
  const [mode, setMode] = useState<AppMode>('auto');
  const [isRecording, setIsRecording] = useState(false);
  const [currentJoke, setCurrentJoke] = useState('');
  const [capturedPhotos, setCapturedPhotos] = useState<CapturedPhoto[]>([]);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [isDetectingSmile, setIsDetectingSmile] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState<VoiceOption>({
    id: 'female-adult',
    name: 'Female Adult',
    gender: 'female',
    ageGroup: 'adult'
  });
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  
  // Voice options for American accents
  const voiceOptions: VoiceOption[] = [
    { id: 'female-child', name: 'Female Child', gender: 'female', ageGroup: 'child' },
    { id: 'female-adult', name: 'Female Adult', gender: 'female', ageGroup: 'adult' },
    { id: 'female-old', name: 'Female Elder', gender: 'female', ageGroup: 'old' },
    { id: 'male-child', name: 'Male Child', gender: 'male', ageGroup: 'child' },
    { id: 'male-adult', name: 'Male Adult', gender: 'male', ageGroup: 'adult' },
    { id: 'male-old', name: 'Male Elder', gender: 'male', ageGroup: 'old' },
  ];
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const speechSynthRef = useRef<SpeechSynthesisUtterance | null>(null);

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

  // Find best matching voice for selected option
  const findBestVoice = useCallback((voiceOption: VoiceOption): SpeechSynthesisVoice | null => {
    if (availableVoices.length === 0) return null;

    // American English voices preferences
    const americanVoices = availableVoices.filter(voice => 
      voice.lang.includes('en-US') || voice.lang.includes('en')
    );

    // Voice matching logic based on gender and age
    let candidates = americanVoices.filter(voice => {
      const name = voice.name.toLowerCase();
      
      if (voiceOption.gender === 'female') {
        return name.includes('female') || 
               name.includes('woman') || 
               name.includes('karen') || 
               name.includes('samantha') || 
               name.includes('susan') || 
               name.includes('sarah') ||
               name.includes('alex') ||
               name.includes('allison');
      } else {
        return name.includes('male') || 
               name.includes('man') || 
               name.includes('daniel') || 
               name.includes('david') || 
               name.includes('tom') ||
               name.includes('fred') ||
               name.includes('aaron');
      }
    });

    // If no gender-specific voices found, use any American voice
    if (candidates.length === 0) {
      candidates = americanVoices;
    }

    // Age-specific adjustments (this is approximate since most voices don't specify age)
    if (voiceOption.ageGroup === 'child') {
      // Look for higher pitched or voices that might sound younger
      const childVoices = candidates.filter(voice => 
        voice.name.toLowerCase().includes('child') ||
        voice.name.toLowerCase().includes('young')
      );
      if (childVoices.length > 0) candidates = childVoices;
    }

    return candidates[0] || americanVoices[0] || availableVoices[0];
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

  // Speak joke using Web Speech API
  const speakJoke = useCallback((joke: string) => {
    if ('speechSynthesis' in window) {
      // Cancel any ongoing speech
      speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(joke);
      
      // Voice-specific settings
      const voice = findBestVoice(selectedVoice);
      if (voice) {
        utterance.voice = voice;
      }
      
      // Adjust speech parameters based on age group
      switch (selectedVoice.ageGroup) {
        case 'child':
          utterance.rate = 1.1;
          utterance.pitch = 1.4;
          break;
        case 'adult':
          utterance.rate = 0.9;
          utterance.pitch = 1.0;
          break;
        case 'old':
          utterance.rate = 0.7;
          utterance.pitch = 0.8;
          break;
      }
      
      utterance.volume = 0.8;

      utterance.onstart = () => {
        toast.info(`🎭 ${selectedVoice.name} telling joke...`);
      };
      
      utterance.onend = () => {
        if (mode === 'auto' || mode === 'semi-auto') {
          startSmileDetection();
        }
      };

      speechSynthRef.current = utterance;
      speechSynthesis.speak(utterance);
    } else {
      toast.error('Speech synthesis not supported in this browser');
      if (mode === 'auto' || mode === 'semi-auto') {
        startSmileDetection();
      }
    }
  }, [mode, selectedVoice, findBestVoice]);

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
  }, [isModelLoaded, cameraActive]);

  // Start smile detection
  const startSmileDetection = useCallback(() => {
    if (!isModelLoaded || !cameraActive) {
      toast.error('Camera or face detection not ready');
      return;
    }

    setIsDetectingSmile(true);
    toast.info('😊 Watching for smiles...');
    
    detectionIntervalRef.current = setInterval(detectSmile, 100);
    
    // Auto-stop detection after 30 seconds
    setTimeout(() => {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
        setIsDetectingSmile(false);
        toast.info('Smile detection stopped');
      }
    }, 30000);
  }, [detectSmile, isModelLoaded, cameraActive]);

  // Capture photo from video feed
  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

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
      
      // Create flash effect
      if (videoRef.current) {
        videoRef.current.style.filter = 'brightness(2)';
        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.style.filter = 'brightness(1)';
          }
        }, 150);
      }
    }
  }, [currentJoke, mode]);

  // Get a new random joke
  const getNewJoke = useCallback(() => {
    const joke = getRandomJoke();
    setCurrentJoke(joke);
    return joke;
  }, []);

  // Auto mode: Tell joke and detect smiles
  const startAutoMode = useCallback(async () => {
    if (!cameraActive) {
      await startCamera();
    }
    
    const joke = getNewJoke();
    speakJoke(joke);
  }, [cameraActive, startCamera, getNewJoke, speakJoke]);

  // Semi-auto mode: Manual joke telling, auto photo
  const startSemiAutoMode = useCallback(async () => {
    if (!cameraActive) {
      await startCamera();
    }
    
    getNewJoke();
    toast.info('Tell the joke manually, then click "Start Smile Detection"');
  }, [cameraActive, startCamera, getNewJoke]);

  // Manual mode: Everything manual
  const startManualMode = useCallback(async () => {
    if (!cameraActive) {
      await startCamera();
    }
    
    getNewJoke();
    toast.info('Manual mode: Tell joke and take photo manually');
  }, [cameraActive, startCamera, getNewJoke]);

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

  // Stop speech
  const stopSpeech = useCallback(() => {
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel();
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
      stopSpeech();
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }
    };
  }, [stopCamera, stopSpeech]);

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

        {/* Mode Selection */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Smile className="h-5 w-5 text-smile" />
            Choose Your Mode
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button
              variant={mode === 'auto' ? 'default' : 'outline'}
              onClick={() => setMode('auto')}
              className={`h-auto p-4 flex flex-col gap-2 transition-all ${
                mode === 'auto' ? 'ring-2 ring-primary ring-offset-2 bg-gradient-fun text-white' : 'hover:bg-muted'
              }`}
            >
              <Volume2 className="h-8 w-8" />
              <div className="text-center">
                <div className="font-semibold">Auto Mode</div>
                <div className="text-sm opacity-80">
                  AI tells joke & detects smiles
                </div>
              </div>
            </Button>
            
            <Button
              variant={mode === 'semi-auto' ? 'default' : 'outline'}
              onClick={() => setMode('semi-auto')}
              className={`h-auto p-4 flex flex-col gap-2 transition-all ${
                mode === 'semi-auto' ? 'ring-2 ring-primary ring-offset-2 bg-gradient-fun text-white' : 'hover:bg-muted'
              }`}
            >
              <div className="flex items-center gap-1">
                <Mic className="h-6 w-6" />
                <Camera className="h-6 w-6" />
              </div>
              <div className="text-center">
                <div className="font-semibold">Semi-Auto</div>
                <div className="text-sm opacity-80">
                  You tell joke, AI detects smiles
                </div>
              </div>
            </Button>
            
            <Button
              variant={mode === 'manual' ? 'default' : 'outline'}
              onClick={() => setMode('manual')}
              className={`h-auto p-4 flex flex-col gap-2 transition-all ${
                mode === 'manual' ? 'ring-2 ring-primary ring-offset-2 bg-gradient-fun text-white' : 'hover:bg-muted'
              }`}
            >
              <div className="flex items-center gap-1">
                <Mic className="h-6 w-6" />
                <MicOff className="h-6 w-6" />
              </div>
              <div className="text-center">
                <div className="font-semibold">Manual Mode</div>
                <div className="text-sm opacity-80">
                  Full manual control
                </div>
              </div>
            </Button>
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Camera and Controls */}
          <Card className="p-6">
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
              <div className="relative bg-muted rounded-lg overflow-hidden aspect-video">
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

                {mode === 'auto' && (
                  <Button 
                    onClick={startAutoMode}
                    disabled={!cameraActive || !isModelLoaded}
                    className="bg-gradient-fun"
                  >
                    <Volume2 className="h-4 w-4 mr-2" />
                    Start Auto Mode
                  </Button>
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
                      disabled={!cameraActive}
                      variant="outline"
                    >
                      <Camera className="h-4 w-4 mr-2" />
                      Take Photo
                    </Button>
                  </>
                )}

                <Button onClick={stopSpeech} variant="outline" size="sm">
                  Stop Speech
                </Button>
              </div>
            </div>
          </Card>

          {/* Current Joke */}
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              🎭 Current Joke
              <Button 
                onClick={getNewJoke} 
                variant="outline" 
                size="sm"
                className="ml-auto"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </h2>
            
            <div className="space-y-4">
              {/* Voice Selection */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <Volume2 className="h-4 w-4" />
                  Narrator Voice
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {voiceOptions.map((voice) => (
                    <Button
                      key={voice.id}
                      variant={selectedVoice.id === voice.id ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedVoice(voice)}
                      className={`text-xs h-8 ${
                        selectedVoice.id === voice.id 
                          ? 'bg-gradient-fun text-white' 
                          : 'hover:bg-muted'
                      }`}
                    >
                      {voice.name}
                    </Button>
                  ))}
                </div>
              </div>
              
              <Separator />
              
              <div className="p-4 bg-muted rounded-lg min-h-[120px] flex items-center">
                {currentJoke ? (
                  <p className="text-lg leading-relaxed">{currentJoke}</p>
                ) : (
                  <p className="text-muted-foreground italic">
                    Click "Get Joke" to load a joke
                  </p>
                )}
              </div>
              
              {currentJoke && mode !== 'manual' && (
                <Button 
                  onClick={() => speakJoke(currentJoke)}
                  className="w-full bg-gradient-fun"
                >
                  <Volume2 className="h-4 w-4 mr-2" />
                  {selectedVoice.name} Tells Joke
                </Button>
              )}
            </div>
          </Card>
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