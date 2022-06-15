cp ./macOSservice/com.urhome.service-template.plist ./macOSservice/com.urhome.service.plist
read -p "Enter the desired working directory: " workingDirectory
mkdir -p "$workingDirectory"
nodePath=$(which node)
sed -i '' "s|(username)|${USER}|g" ./macOSservice/com.urhome.service.plist
sed -i '' "s|(path/to/node)|${nodePath}|g" ./macOSservice/com.urhome.service.plist
sed -i '' "s|(path/to/service.js)|${PWD}\/service.js|g" ./macOSservice/com.urhome.service.plist
sed -i '' "s|(/path/to/workingDirectory)|${workingDirectory}|g" ./macOSservice/com.urhome.service.plist
read -p "Load? (y) " load
if [ "$load" != "y" ]; then
    exit 0
fi
sudo cp ./macOSservice/com.urhome.service.plist /Library/LaunchAgents/
launchctl load /Library/LaunchAgents/com.urhome.service.plist