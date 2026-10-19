# Windows equivalent of the Makefile. Usage: .\tasks.ps1 <install|local|test|build|deploy|outputs|destroy> [--yes]
param(
    [Parameter(Position = 0, Mandatory = $true)]
    [ValidateSet('install', 'local', 'test', 'build', 'deploy', 'outputs', 'destroy')]
    [string]$Task,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Rest
)
python "$PSScriptRoot\scripts\tasks.py" $Task @Rest
exit $LASTEXITCODE
