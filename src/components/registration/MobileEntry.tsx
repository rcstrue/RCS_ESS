import { useState } from 'react';
import { Phone, ArrowRight, Loader2, Calendar, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ProfilePhotoCapture } from '@/components/registration/ProfilePhotoCapture';
import { uploadBase64Image, getFileUrl } from '@/lib/api/config';
import { toast } from 'sonner';

interface MobileEntryProps {
  onMobileSubmit: (mobile: string, profilePicUrl?: string) => void;
  onLoginSubmit: (mobile: string, dob: string) => Promise<{ success: boolean; error?: string }>;
  checkMobileExists: (mobile: string) => Promise<boolean>;
}

export function MobileEntry({ onMobileSubmit, onLoginSubmit, checkMobileExists }: MobileEntryProps) {
  const [mobileNumber, setMobileNumber] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [dobDay, setDobDay] = useState('');
  const [dobMonth, setDobMonth] = useState('');
  const [dobYear, setDobYear] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showLoginForm, setShowLoginForm] = useState(false);
  const [showProfileCapture, setShowProfileCapture] = useState(false);
  const [profilePicUrl, setProfilePicUrl] = useState<string | null>(null);
  const [isUploadingProfile, setIsUploadingProfile] = useState(false);
  const [error, setError] = useState('');
  const [mobileError, setMobileError] = useState('');

  const validateMobile = (value: string) => {
    const cleaned = value.replace(/\D/g, '').slice(0, 10);
    setMobileNumber(cleaned);
    
    if (cleaned.length === 10) {
      if (!/^[6-9]/.test(cleaned)) {
        setMobileError('Mobile number must start with 6, 7, 8, or 9');
        return false;
      }
      setMobileError('');
      return true;
    }
    setMobileError('');
    return false;
  };

  const handleContinue = async () => {
    if (mobileNumber.length !== 10) {
      setMobileError('Please enter a valid 10-digit mobile number');
      return;
    }

    if (!/^[6-9]/.test(mobileNumber)) {
      setMobileError('Mobile number must start with 6, 7, 8, or 9');
      return;
    }

    setIsChecking(true);
    setError('');

    try {
      const exists = await checkMobileExists(mobileNumber);
      
      if (exists) {
        setShowLoginForm(true);
      } else {
        // New user - show profile photo capture
        setShowProfileCapture(true);
      }
    } catch (err) {
      // If backend is unreachable, proceed to registration
      setShowProfileCapture(true);
    } finally {
      setIsChecking(false);
    }
  };

  const handleProfileCapture = async (imageData: string) => {
    console.log('=== MobileEntry handleProfileCapture called ===');
    setIsUploadingProfile(true);
    try {
      const { url, error } = await uploadBase64Image(imageData, 'profile-photo.jpg', 'profile');
      console.log('MobileEntry - upload result:', { url, error });
      if (error || !url) {
        toast.error(error || 'Upload failed. Please try again.');
        setIsUploadingProfile(false);
        return;
      }
      setProfilePicUrl(url);
      console.log('=== MobileEntry - profilePicUrl SET TO:', url);
      toast.success('Profile photo captured successfully.');
    } catch (err) {
      console.error('MobileEntry - upload error:', err);
      toast.error('Upload failed. Please try again.');
    } finally {
      setIsUploadingProfile(false);
    }
  };

  const handleProfileRetake = () => {
    setProfilePicUrl(null);
  };

  const handleSkipProfile = () => {
    onMobileSubmit(mobileNumber, undefined);
  };

  const handleProceedWithProfile = () => {
    console.log('=== MobileEntry handleProceedWithProfile called ===');
    console.log('mobileNumber:', mobileNumber);
    console.log('profilePicUrl:', profilePicUrl);
    // Store in localStorage as backup
    if (profilePicUrl) {
      localStorage.setItem('registration_profile_pic', profilePicUrl);
      console.log('=== Saved profile pic to localStorage:', profilePicUrl);
    }
    console.log('Calling onMobileSubmit with:', mobileNumber, profilePicUrl);
    onMobileSubmit(mobileNumber, profilePicUrl || undefined);
  };

  const handleLogin = async () => {
    if (!dateOfBirth) {
      setError('Please enter your date of birth');
      return;
    }

    setIsLoggingIn(true);
    setError('');

    const result = await onLoginSubmit(mobileNumber, dateOfBirth);
    
    if (!result.success) {
      setError(result.error || 'Login failed');
    }
    
    setIsLoggingIn(false);
  };

  // Build YYYY-MM-DD from separate inputs
  const buildDob = (d: string, m: string, y: string): string => {
    if (d && m && y && d.length <= 2 && m.length <= 2 && y.length === 4) {
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    return '';
  };

  // Sync separate inputs → dateOfBirth
  const handleDobChange = (day: string, month: string, year: string) => {
    setDobDay(day);
    setDobMonth(month);
    setDobYear(year);
    setDateOfBirth(buildDob(day, month, year));
  };

  const handleBackToMobile = () => {
    setShowLoginForm(false);
    setShowProfileCapture(false);
    setDateOfBirth('');
    setDobDay('');
    setDobMonth('');
    setDobYear('');
    setError('');
    setProfilePicUrl(null);
  };

  // Profile Photo Capture Screen (for new users)
  if (showProfileCapture) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-primary/5">
        <div className="w-full max-w-md">
          <div className="form-section animate-slide-up">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Camera className="w-8 h-8 text-primary" />
              </div>
              <h1 className="text-xl font-bold text-foreground mb-2">
                Capture Profile Photo
              </h1>
              <p className="text-sm text-muted-foreground">
                Take a clear photo for your employee profile
              </p>
            </div>

            <div className="space-y-4">
              {isUploadingProfile && (
                <div className="flex items-center justify-center gap-2 p-4 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Uploading profile photo...
                </div>
              )}
              
              <ProfilePhotoCapture
                onCapture={handleProfileCapture}
                capturedImage={profilePicUrl}
                onRetake={handleProfileRetake}
              />

              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground text-center">
                  Mobile: +91 {mobileNumber}
                </p>
              </div>

              {error && (
                <p className="text-sm text-destructive text-center">{error}</p>
              )}

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={handleBackToMobile}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  onClick={handleProceedWithProfile}
                  className="flex-1"
                  disabled={!profilePicUrl || isUploadingProfile}
                >
                  Continue
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
              {!profilePicUrl && (
                <p className="text-xs text-center text-muted-foreground">
                  Please capture a profile photo to continue, or skip if unavailable
                </p>
              )}
              <Button
                variant="ghost"
                onClick={handleSkipProfile}
                className="w-full text-muted-foreground"
                size="sm"
              >
                Skip for now
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-primary/5">
      <div className="w-full max-w-md">
        <div className="form-section animate-slide-up">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Phone className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">
              Employee Registration
            </h1>
            <p className="text-muted-foreground">
              {showLoginForm 
                ? 'Verify your identity to access your profile'
                : 'Enter your mobile number to get started'
              }
            </p>
          </div>

          <div className="space-y-6">
            {!showLoginForm ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="mobile">Mobile Number</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      +91
                    </span>
                    <Input
                      id="mobile"
                      type="tel"
                      inputMode="numeric"
                      value={mobileNumber}
                      onChange={(e) => validateMobile(e.target.value)}
                      placeholder="Enter 10-digit mobile"
                      className={`pl-12 text-lg h-12 ${mobileError ? 'border-destructive' : ''}`}
                    />
                  </div>
                  {mobileError && (
                    <p className="text-xs text-destructive">{mobileError}</p>
                  )}
                </div>

                {error && (
                  <p className="text-sm text-destructive text-center">{error}</p>
                )}

                <Button
                  onClick={handleContinue}
                  disabled={mobileNumber.length !== 10 || isChecking}
                  className="w-full h-12 text-lg"
                  size="lg"
                >
                  {isChecking ? (
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  ) : (
                    <ArrowRight className="w-5 h-5 mr-2" />
                  )}
                  {isChecking ? 'Checking...' : 'Continue'}
                </Button>
              </>
            ) : (
              <>
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">Mobile Number</p>
                  <p className="text-lg font-medium">+91 {mobileNumber}</p>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    Date of Birth (for verification)
                  </Label>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <span className="text-[10px] font-medium text-muted-foreground uppercase">Day</span>
                      <Input
                        type="tel"
                        inputMode="numeric"
                        placeholder="DD"
                        value={dobDay}
                        onChange={(e) => handleDobChange(e.target.value.replace(/\D/g, '').slice(0, 2), dobMonth, dobYear)}
                        className="h-12 text-center text-lg"
                        maxLength={2}
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-medium text-muted-foreground uppercase">Month</span>
                      <Input
                        type="tel"
                        inputMode="numeric"
                        placeholder="MM"
                        value={dobMonth}
                        onChange={(e) => handleDobChange(dobDay, e.target.value.replace(/\D/g, '').slice(0, 2), dobYear)}
                        className="h-12 text-center text-lg"
                        maxLength={2}
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-medium text-muted-foreground uppercase">Year</span>
                      <Input
                        type="tel"
                        inputMode="numeric"
                        placeholder="YYYY"
                        value={dobYear}
                        onChange={(e) => handleDobChange(dobDay, dobMonth, e.target.value.replace(/\D/g, '').slice(0, 4))}
                        className="h-12 text-center text-lg"
                        maxLength={4}
                      />
                    </div>
                  </div>
                </div>

                {error && (
                  <p className="text-sm text-destructive text-center">{error}</p>
                )}

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={handleBackToMobile}
                    className="flex-1 h-12"
                  >
                    Back
                  </Button>
                  <Button
                    onClick={handleLogin}
                    disabled={!dateOfBirth || isLoggingIn}
                    className="flex-1 h-12"
                  >
                    {isLoggingIn ? (
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    ) : (
                      <ArrowRight className="w-5 h-5 mr-2" />
                    )}
                    {isLoggingIn ? 'Verifying...' : 'Login'}
                  </Button>
                </div>

                <p className="text-xs text-center text-muted-foreground">
                  Your account was found. Please verify your date of birth to continue.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
