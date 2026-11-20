#!/usr/bin/env bash
# Sets the iPhone project up as one of the two apps, before it's built
# (codemagic.yaml; claude-project/SPLIT_PLAN.md, step 4). There's one
# Xcode project; this changes the checked-out copy on the build machine:
# the bundle ID, the name under the icon, the icon itself and the version
# people see (that app's build label). The project holds EnFact's icon;
# Contractor's comes from branding/icons/contractor/ios (both made by
# scripts/render-icons.mjs). The web app must be built for the same app first
# (npm run build:<app>, npx cap sync ios).
#   scripts/ios-app.sh enfact       Inspecta - EnFact, TestFlight only
#   scripts/ios-app.sh contractor   Inspecta - Site Inspections
# perl rather than sed -i, so it runs the same on macOS and Linux.
set -euo pipefail
cd "$(dirname "$0")/.."

case "${1:-}" in
  enfact) BUNDLE_ID=au.com.inspecta.app; NAME=EnFact; LABEL_FILE=BUILD_LABEL_ENFACT; ICON= ;;
  contractor) BUNDLE_ID=au.com.inspecta.site; NAME=Inspecta; LABEL_FILE=BUILD_LABEL_CONTRACTOR; ICON=branding/icons/contractor/ios/AppIcon-512@2x.png ;;
  *) echo "Usage: scripts/ios-app.sh enfact|contractor" >&2; exit 1 ;;
esac

PROJECT=ios/App/App.xcodeproj/project.pbxproj
PLIST=ios/App/App/Info.plist
APPICON=ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png

# the version people see (TestFlight, the App Store, the app's Settings);
# Apple only takes numbers and dots (like 9.2), so anything else stops here
VERSION=$(tr -d '[:space:]' < "$LABEL_FILE")
if ! printf '%s' "$VERSION" | grep -Eq '^[0-9]+(\.[0-9]+){0,2}$'; then
  echo "$LABEL_FILE is '$VERSION': the App Store needs numbers and dots, like 9.2 or 1.0.1" >&2
  exit 1
fi

BUNDLE_ID="$BUNDLE_ID" VERSION="$VERSION" perl -pi -e '
  s/PRODUCT_BUNDLE_IDENTIFIER = [^;]*;/PRODUCT_BUNDLE_IDENTIFIER = $ENV{BUNDLE_ID};/;
  s/MARKETING_VERSION = [^;]*;/MARKETING_VERSION = $ENV{VERSION};/;
' "$PROJECT"
NAME="$NAME" perl -0pi -e 's|(<key>CFBundleDisplayName</key>\s*<string>)[^<]*(</string>)|$1$ENV{NAME}$2|' "$PLIST"

# the app's own icon (EnFact's is already in the project)
if [ -n "$ICON" ]; then
  [ -f "$ICON" ] || { echo "no icon at $ICON (node scripts/render-icons.mjs makes it)" >&2; exit 1; }
  cp "$ICON" "$APPICON"
fi

# stop here if anything didn't take
[ "$(grep -c "PRODUCT_BUNDLE_IDENTIFIER = $BUNDLE_ID;" "$PROJECT")" -ge 2 ] || { echo "bundle ID not set in $PROJECT" >&2; exit 1; }
[ "$(grep -c "MARKETING_VERSION = $VERSION;" "$PROJECT")" -ge 2 ] || { echo "version not set in $PROJECT" >&2; exit 1; }
[ -z "$ICON" ] || cmp -s "$ICON" "$APPICON" || { echo "icon not set in $APPICON" >&2; exit 1; }
perl -0ne "exit(/<key>CFBundleDisplayName<\/key>\s*<string>\Q$NAME\E<\/string>/ ? 0 : 1)" "$PLIST" || { echo "name not set in $PLIST" >&2; exit 1; }
echo "iPhone project set up as $1: $BUNDLE_ID, \"$NAME\", version $VERSION, icon ${ICON:-as in the project}"
