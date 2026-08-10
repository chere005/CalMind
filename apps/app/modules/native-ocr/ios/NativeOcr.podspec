Pod::Spec.new do |s|
  s.name             = 'NativeOcr'
  s.version          = '0.1.0'
  s.summary          = 'On-device text recognition for recipe cards, via Apple Vision.'
  s.author           = 'Sean Cheren'
  s.homepage         = 'https://github.com/chere005/CalMind'
  s.license          = { :type => 'MIT' }
  s.platforms        = { :ios => '15.1' }
  s.source           = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files     = '**/*.{h,m,swift}'
end
