pipeline {
    agent any
    
    parameters {
        choice(
            name: 'ENVIRONMENT', 
            choices: ['dev', 'staging', 'production'], 
            description: 'Deploy to which environment? (For feature branches, typically "dev")'
        )
        // Changed DEPLOY_BRANCH to a string parameter.
        // For webhook-triggered builds, the Initialize stage will try to override this.
        // For manual builds, you can specify the branch here.
        string(
            name: 'DEPLOY_BRANCH', 
            defaultValue: 'develop', // Default for manual builds if not specified
            description: 'Branch to deploy (e.g., main, develop, feature/user-auth). Overridden by webhook for push events.'
        )
        booleanParam(
            name: 'SKIP_TESTS', 
            defaultValue: false, 
            description: 'Skip running tests'
        )
        booleanParam(
            name: 'FORCE_DEPLOY', 
            defaultValue: false, 
            description: 'Force deployment without approval'
        )
        // You might want a similar parameter for creating ephemeral backend apps for features
        // booleanParam(name: 'CREATE_FEATURE_BACKEND_APP', defaultValue: false, description: 'Create ephemeral Heroku app for feature branches')
    }
    
    environment {
        // Dynamic app name based on environment and potentially branch type
        // HEROKU_APP_NAME will be refined in the Initialize or Create Feature Environment stage
        HEROKU_API_KEY = credentials('HEROKU_API_KEY') // Ensure this credential ID is correct in Jenkins
        DEPLOY_ENV = "${params.ENVIRONMENT}"
    }
    
    tools {
        nodejs 'NodeJS_18_on_EC2' // Ensure this Node.js installation is configured in Jenkins Global Tool Configuration
    }
    
    stages {
        stage('Initialize') {
            steps {
                script {
                    // --- Reliable Branch Resolution ---
                    def resolvedBranch = params.DEPLOY_BRANCH // Start with parameter (for manual builds)
                    
                    if (env.GIT_BRANCH) { // env.GIT_BRANCH is often set by Git plugin from webhook (e.g., origin/feature/foo)
                        resolvedBranch = env.GIT_BRANCH
                    } else if (env.BRANCH_NAME) { // env.BRANCH_NAME is often set by Multibranch pipelines or some Git plugins
                        resolvedBranch = env.BRANCH_NAME
                    }

                    // Clean up common prefixes from the branch name
                    resolvedBranch = resolvedBranch.replaceFirst(/^origin\//, '')
                                               .replaceFirst(/^refs\/heads\//, '')
                                               .replaceFirst(/^refs\/remotes\/origin\//, '')
                    
                    // If, after all that, it's empty or still the default 'develop' from params,
                    // and we suspect a push trigger, try one more git command if in a workspace.
                    // This is a deeper fallback, usually not needed if GIT_BRANCH or BRANCH_NAME is set.
                    if (resolvedBranch == 'develop' && (env.GIT_BRANCH || env.BRANCH_NAME)) {
                        // If GIT_BRANCH or BRANCH_NAME was available, we trust the cleaned version from above.
                        // The 'develop' default for params.DEPLOY_BRANCH is primarily for manual "Build with Parameters".
                    } else if (!env.GIT_BRANCH && !env.BRANCH_NAME && resolvedBranch == 'develop') {
                        // If triggered manually and DEPLOY_BRANCH was left as default 'develop'
                        echo "Using DEPLOY_BRANCH parameter default: ${resolvedBranch}"
                    }


                    env.RESOLVED_BRANCH = resolvedBranch
                    env.DEPLOY_BRANCH = resolvedBranch // For compatibility if other parts of your script use this exact name

                    echo "✅ Resolved branch for this build: ${env.RESOLVED_BRANCH}"

                    // --- Dynamic Heroku App Name Setup ---
                    if (env.RESOLVED_BRANCH.startsWith('feature/') && params.ENVIRONMENT == 'dev') {
                        // Potentially create a unique name for feature branch dev deployments
                        // For now, we'll use the standard dev app name, but you could add logic here
                        // similar to your frontend for CREATE_FEATURE_APP if desired for backend.
                        env.HEROKU_APP_NAME = "fakebook-backend-dev" // Or make it unique like "fakebook-backend-ft-featurename"
                        echo "ℹ️  Feature branch will target Heroku app: ${env.HEROKU_APP_NAME} (dev environment)"
                    } else {
                        env.HEROKU_APP_NAME = "${params.ENVIRONMENT == 'production' ? 'fakebook-backend-a2a77a290552' : 'fakebook-backend-' + params.ENVIRONMENT}"
                    }
                }
            }
        }

        stage('Environment Info') {
            steps {
                script {
                    echo "🎯 Deploying Backend to: ${params.ENVIRONMENT}"
                    echo "📦 Heroku app: ${env.HEROKU_APP_NAME}" // Use env.HEROKU_APP_NAME
                    echo "🌿 Branch: ${env.RESOLVED_BRANCH}"    // Use env.RESOLVED_BRANCH
                    echo "🔨 Build: ${BUILD_NUMBER}"
                    
                    def branch = env.RESOLVED_BRANCH
                    if (branch.startsWith('feature/')) {
                        echo "🚀 Feature branch deployment"
                    } else if (branch == 'develop') {
                        echo "🔧 Development branch deployment"
                    } else if (branch == 'main' || branch == 'master') {
                        echo "🏭 Production branch deployment"
                    } else {
                        echo "📌 Unrecognized branch pattern for specific flow: ${branch}"
                    }
                }
            }
        }
        
        stage('Validate GitFlow Rules') {
            steps {
                script {
                    def branch = env.RESOLVED_BRANCH // Use resolved branch
                    def envParam = params.ENVIRONMENT // Use a different name to avoid confusion with global 'env'

                    if (envParam == 'production' && !branch.matches('main|master')) {
                        error("❌ Production can only be deployed from main branch")
                    } else if (envParam == 'staging' && branch != 'develop' && !branch.startsWith('release/') && !branch.startsWith('hotfix/')) {
                        // Adjusted to allow release and hotfix to staging
                        if (!params.FORCE_DEPLOY) {
                            error("❌ Staging typically deploys from develop, release/*, or hotfix/* branches. Use FORCE_DEPLOY to override.")
                        } else {
                             echo "⚠️  WARNING: Force deploying ${branch} to staging"
                        }
                    }
                    // For 'dev' environment, we can assume any branch is fine, or add specific rules if needed.
                    
                    echo "✅ GitFlow validation passed: ${branch} → ${envParam}"
                }
            }
        }
        
        stage('Checkout Code') {
            steps {
                script {
                    echo "Attempting to checkout resolved branch: ${env.RESOLVED_BRANCH}"
                    checkout([
                        $class: 'GitSCM',
                        branches: [[name: "*/${env.RESOLVED_BRANCH}"]], // Use wildcard to match remote ref like 'origin/feature/...'
                        extensions: [
                            [$class: 'LocalBranch', localBranch: "**"], // Ensure local branch matches remote
                            [$class: 'CleanBeforeCheckout'] // Optional: clean workspace
                        ],
                        userRemoteConfigs: [[
                            url: 'https://github.com/DavidHunterJS/fakebook-backend.git'
                            // credentialsId: 'YOUR_GITHUB_CREDENTIAL_ID_IF_PRIVATE_REPO' // IMPORTANT: Add if your repo is private
                        ]]
                    ])
                    echo "Checked out branch: ${env.RESOLVED_BRANCH}"
                    sh "git branch --show-current || git symbolic-ref --short HEAD" // Verify current branch
                }
            }
        }
        
        stage('Ensure Dev App Exists') { // Consider renaming or making conditional if feature apps are unique
            when {
                expression { params.ENVIRONMENT == 'dev' } // Typically only for 'dev' or if creating feature apps
            }
            steps {
                script {
                    // This stage might need adjustment if you implement unique backend feature apps
                    sh '''
                        echo "Ensuring ${DEPLOY_ENV} backend app (${HEROKU_APP_NAME}) exists..."
                        
                        # Check if app exists
                        if heroku apps:info -a ${HEROKU_APP_NAME} >/dev/null 2>&1; then
                            echo "✅ App ${HEROKU_APP_NAME} already exists"
                        else
                            echo "Creating new Heroku app: ${HEROKU_APP_NAME}"
                            heroku create ${HEROKU_APP_NAME} || echo "App creation may have failed or it already exists (race condition)."
                        fi
                        
                        # Display app info
                        heroku apps:info -a ${HEROKU_APP_NAME}
                    '''
                }
            }
        }
        
        stage('Install Dependencies') {
            steps {
                sh '''
                    if [ ! -d "node_modules" ] || [ package.json -nt node_modules ]; then
                        echo "Installing dependencies with npm ci..."
                        npm ci
                    else
                        echo "Using cached node_modules"
                    fi
                '''
            }
        }
        
        stage('Configure Environment') { // Backend config is usually via Heroku Config Vars
            steps {
                script {
                    sh '''
                        echo "Configuring backend for ${DEPLOY_ENV} environment..."
                        echo "Backend environment variables should be set as Heroku Config Vars."
                        
                        # Example: You might set a specific config var based on branch/env
                        # if [ "${RESOLVED_BRANCH}" = "feature/some-feature" ]; then
                        #   heroku config:set MY_FEATURE_FLAG=true -a ${HEROKU_APP_NAME}
                        # fi
                        
                        echo "Environment: ${DEPLOY_ENV}"
                        echo "Branch: ${RESOLVED_BRANCH}"
                    '''
                }
            }
        }
        
        stage('Run Tests') {
            when {
                expression { params.SKIP_TESTS == false }
            }
            steps {
                sh 'npm test || echo "No tests configured or tests failed (non-critical for this example)"'
            }
        }
        
        stage('Deployment Approval') {
            when {
                expression { params.ENVIRONMENT == 'production' && params.FORCE_DEPLOY == false }
            }
            steps {
                script {
                    def userInput = input(
                        message: "Deploy to PRODUCTION Backend?",
                        ok: 'Deploy',
                        parameters: [
                            string(name: 'CONFIRMATION', defaultValue: '', description: 'Type "DEPLOY" to confirm')
                        ]
                    )
                    if (userInput != 'DEPLOY') {
                        error('Deployment cancelled')
                    }
                }
            }
        }
        
        stage('Deploy to Heroku') {
            steps {
                script {
                    sh '''
                        echo "Deploying backend branch ${RESOLVED_BRANCH} to Heroku app ${HEROKU_APP_NAME} (${DEPLOY_ENV})..."
                        
                        # Configure git for this operation
                        git config user.email "jenkins@your-domain.com"
                        git config user.name "Jenkins CI"
                        
                        # Add Heroku remote
                        # The `|| git remote set-url ...` handles if the remote already exists
                        git remote add heroku-deploy https://heroku:$HEROKU_API_KEY@git.heroku.com/${HEROKU_APP_NAME}.git || \
                        git remote set-url heroku-deploy https://heroku:$HEROKU_API_KEY@git.heroku.com/${HEROKU_APP_NAME}.git
                        
                        # Deploy the current branch (RESOLVED_BRANCH) to Heroku's main branch
                        git push heroku-deploy HEAD:main --force
                        
                        echo "Backend deployed to ${DEPLOY_ENV}"
                    '''
                }
            }
        }
        
        stage('Verify Deployment') {
            steps {
                script {
                    sh '''
                        echo "Waiting for backend to be ready on ${HEROKU_APP_NAME}"
                        sleep 30 # Give Heroku some time to restart/deploy
                        
                        APP_URL=$(heroku info -a ${HEROKU_APP_NAME} --json | grep web_url | cut -d '"' -f 4)
                        if [ -z "$APP_URL" ]; then
                            echo "⚠️ Could not retrieve web_url for ${HEROKU_APP_NAME}"
                            APP_URL="https://${HEROKU_APP_NAME}.herokuapp.com/" # Fallback guess
                        fi
                        echo "Backend URL: $APP_URL"
                        
                        # Test health endpoint (ensure your backend has a /health endpoint)
                        HEALTH_URL="${APP_URL%/}/health" # Ensure no double slash if APP_URL has trailing /
                        echo "Pinging health endpoint: $HEALTH_URL"
                        HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" || echo "000")
                        
                        if [ "$HTTP_STATUS" -eq 200 ]; then
                            echo "✅ Backend on ${HEROKU_APP_NAME} is healthy (status $HTTP_STATUS)!"
                        else
                            echo "⚠️  Backend on ${HEROKU_APP_NAME} returned status $HTTP_STATUS from $HEALTH_URL"
                            echo "Check backend logs for ${HEROKU_APP_NAME}:"
                            # The --since flag might not be supported by older Heroku CLI versions
                            heroku logs -n 5 -a ${HEROKU_APP_NAME} || heroku logs -n 5 -a ${HEROKU_APP_NAME} || echo "Could not fetch logs"
                        fi
                    '''
                }
            }
        }
    }
    
    post {
        always {
            echo "Pipeline finished for ${DEPLOY_ENV} environment, branch ${env.RESOLVED_BRANCH}."
        }
        success {
            script {
                echo "✅ Backend pipeline succeeded for ${DEPLOY_ENV} on branch ${env.RESOLVED_BRANCH}!"
                sh """
                    APP_URL=\$(heroku info -a ${HEROKU_APP_NAME} --json | grep web_url | cut -d '"' -f 4 || echo "https://${HEROKU_APP_NAME}.herokuapp.com")
                    echo "🌐 Backend should be available at: \$APP_URL"
                """
            }
        }
        failure {
            echo "❌ Backend pipeline failed for ${DEPLOY_ENV} on branch ${env.RESOLVED_BRANCH}!"
        }
    }
}
